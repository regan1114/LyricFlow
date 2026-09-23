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
  watch(volume, (value) => {
    if (master) master.gain.value = value;
  });

  async function initAudio() {
    if (!resources.audioContextRef.current) {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.82;
      analyser.minDecibels = -85;
      analyser.maxDecibels = -15;
      master = context.createGain();
      master.gain.value = volume.value;
      master.connect(analyser);
      analyser.connect(context.destination);
      resources.audioContextRef.current = context;
      resources.analyserRef.current = analyser;
      resources.sourceRef.current = master;
    }
    await resources.audioContextRef.current.resume();
  }

  async function play() {
    if (!timeline || !isLoaded.value || isPlaying.value) return;
    const request = ++playbackRequest;
    await initAudio();
    if (request !== playbackRequest) return;
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
    if (!timeline) return;
    const nextTime = Math.max(0, Math.min(duration.value, time));
    const resume = isPlaying.value;
    if (resume) pause();
    currentTime.value = nextTime;
    renderState.current.currentTime = nextTime;
    timeline.sync(nextTime, false);
    if (resume) void play().catch(() => reportError('無法恢復時間軸播放。'));
  }

  onBeforeUnmount(() => {
    pause();
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
    setTimeline,
    initAudio,
    play,
    pause,
    toggle,
    seek,
    getCurrentTime: () => (isPlaying.value ? timelineTime() : currentTime.value),
  };
}
export type AudioPlayer = ReturnType<typeof useAudioPlayer>;
