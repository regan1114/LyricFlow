import { onBeforeUnmount, ref, watch } from 'vue';
import type { RenderResources, RenderState, Slot } from '../engine/resources';

export interface PlaybackTimeline {
  duration: number;
  schedule: (context: AudioContext, output: AudioNode, time: number, startAt: number) => () => void;
  sync: (time: number, playing: boolean) => void;
}

export function useAudioPlayer(
  resources: RenderResources,
  renderState: Slot<RenderState>,
  reportError: (message: string) => void,
) {
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(0.8);
  const isLoaded = ref(false);
  const audio = new Audio();
  let playbackRequest = 0;
  let timeline: PlaybackTimeline | null = null;
  let stopSources: (() => void) | null = null;
  let clockFrame: number | null = null;
  let clockOrigin = 0;
  let playheadOrigin = 0;
  let master: GainNode | null = null;
  function timelineTime() {
    return Math.min(
      duration.value,
      playheadOrigin +
        Math.max(0, (resources.audioContextRef.current?.currentTime || 0) - clockOrigin),
    );
  }
  function tick() {
    if (!timeline || !isPlaying.value) return;
    currentTime.value = timelineTime();
    renderState.current.currentTime = currentTime.value;
    timeline.sync(currentTime.value, true);
    if (currentTime.value >= duration.value) {
      pause();
      return;
    }
    clockFrame = requestAnimationFrame(tick);
  }
  function setTimeline(next: PlaybackTimeline) {
    pause();
    timeline = next;
    duration.value = next.duration;
    renderState.current.timelineDuration = next.duration;
    isLoaded.value = next.duration > 0;
    seek(Math.min(currentTime.value, next.duration));
  }
  resources.audioRef.current = audio;
  audio.volume = volume.value;
  audio.preload = 'metadata';

  const listeners = {
    timeupdate: () => {
      if (!timeline) currentTime.value = audio.currentTime;
    },
    loadedmetadata: () => {
      if (timeline) return;
      duration.value = Number.isFinite(audio.duration) ? audio.duration : 0;
      isLoaded.value = duration.value > 0;
    },
    play: () => {
      if (timeline) return;
      isPlaying.value = true;
      renderState.current.isPlaying = true;
    },
    pause: () => {
      if (timeline) return;
      isPlaying.value = false;
      renderState.current.isPlaying = false;
    },
    ended: () => {
      if (timeline) return;
      isPlaying.value = false;
      renderState.current.isPlaying = false;
    },
    error: () => {
      if (timeline) return;
      isLoaded.value = false;
      reportError('無法播放這個音訊檔案，請確認檔案格式。');
    },
  };
  Object.entries(listeners).forEach(([event, listener]) => audio.addEventListener(event, listener));
  watch(volume, (value) => {
    if (master) master.gain.value = value;
    else audio.volume = value;
  });

  async function initAudio() {
    if (!resources.audioContextRef.current) {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.82;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -15;
      const source = context.createMediaElementSource(audio);
      master = context.createGain();
      master.gain.value = volume.value;
      audio.volume = 1;
      source.connect(master);
      master.connect(analyser);
      analyser.connect(context.destination);
      resources.audioContextRef.current = context;
      resources.analyserRef.current = analyser;
      resources.sourceRef.current = master;
    }
    await resources.audioContextRef.current.resume();
  }

  function load(url: string) {
    pause();
    timeline = null;
    renderState.current.timelineDuration = null;
    duration.value = 0;
    isLoaded.value = false;
    currentTime.value = 0;
    renderState.current.currentTime = 0;
    audio.src = url;
    audio.load();
  }
  async function play() {
    if (!isLoaded.value) return;
    const request = ++playbackRequest;
    await initAudio();
    if (request !== playbackRequest) return;
    if (timeline) {
      if (currentTime.value >= duration.value) seek(0);
      playheadOrigin = currentTime.value;
      clockOrigin = resources.audioContextRef.current!.currentTime + 0.03;
      stopSources = timeline.schedule(
        resources.audioContextRef.current!,
        resources.sourceRef.current!,
        playheadOrigin,
        clockOrigin,
      );
      isPlaying.value = true;
      renderState.current.isPlaying = true;
      tick();
    } else await audio.play();
  }
  function pause() {
    playbackRequest++;
    if (timeline && isPlaying.value) {
      currentTime.value = timelineTime();
      renderState.current.currentTime = currentTime.value;
    }
    stopSources?.();
    stopSources = null;
    if (clockFrame !== null) cancelAnimationFrame(clockFrame);
    clockFrame = null;
    timeline?.sync(currentTime.value, false);
    audio.pause();
    isPlaying.value = false;
    renderState.current.isPlaying = false;
  }
  async function toggle() {
    try {
      if (isPlaying.value) pause();
      else await play();
    } catch {
      reportError('播放失敗，請重新按播放或匯入其他音訊。');
    }
  }
  function seek(time: number) {
    if (!isLoaded.value && !timeline) return;
    const nextTime = Math.max(0, Math.min(duration.value, time));
    if (timeline) {
      const resume = isPlaying.value;
      if (resume) pause();
      currentTime.value = nextTime;
      renderState.current.currentTime = nextTime;
      timeline.sync(nextTime, false);
      if (resume) void play().catch(() => reportError('無法恢復時間軸播放。'));
      return;
    }
    audio.currentTime = nextTime;
    currentTime.value = nextTime;
    renderState.current.currentTime = nextTime;
  }

  onBeforeUnmount(() => {
    pause();
    Object.entries(listeners).forEach(([event, listener]) =>
      audio.removeEventListener(event, listener),
    );
    audio.removeAttribute('src');
    audio.load();
    resources.sourceRef.current?.disconnect();
    resources.analyserRef.current?.disconnect();
    void resources.audioContextRef.current?.close();
  });
  return {
    isPlaying,
    currentTime,
    duration,
    volume,
    isLoaded,
    load,
    setTimeline,
    initAudio,
    play,
    pause,
    toggle,
    seek,
    getCurrentTime: () =>
      timeline ? (isPlaying.value ? timelineTime() : currentTime.value) : audio.currentTime,
  };
}
export type AudioPlayer = ReturnType<typeof useAudioPlayer>;
