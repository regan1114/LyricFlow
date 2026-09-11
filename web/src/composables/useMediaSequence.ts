import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import {
  audioWindow,
  sequenceDuration,
  validateClip,
  type MediaClip,
  type MediaKind,
  type MediaTrack,
} from '../domain/mediaSequence';
import type { VisualMedia, useMediaLibrary } from './useMediaLibrary';
import type { AudioPlayer } from './useAudioPlayer';
import type { RenderResources, RenderState, Slot } from '../engine/resources';
import type { useSubtitleEditor } from './useSubtitleEditor';
import type { Ref } from 'vue';
import type { SubtitleCue } from '../domain/subtitles';
export interface SequenceAsset {
  id: string;
  name: string;
  kind: MediaKind;
  duration: number;
  url: string;
  file: File;
  visual?: VisualMedia;
  buffer?: AudioBuffer;
}
export function useMediaSequence(
  media: ReturnType<typeof useMediaLibrary>,
  player: AudioPlayer,
  resources: RenderResources,
  state: Slot<RenderState>,
  subtitleEditor: ReturnType<typeof useSubtitleEditor>,
  raw: Ref<string>,
  blocked: () => boolean,
  reportError: (message: string) => void,
) {
  const assets = shallowRef<SequenceAsset[]>([]);
  const clips = ref<MediaClip[]>([]);
  const visualMode = ref<'manual' | 'auto'>('auto');
  const visualLocked = computed(() => visualMode.value === 'auto');
  const selectedId = ref<string | null>(null);
  const selected = computed(() => clips.value.find((clip) => clip.id === selectedId.value));
  const assetMap = computed(() => new Map(assets.value.map((asset) => [asset.id, asset])));
  const videos = computed(() =>
    assets.value.flatMap((asset) => (asset.visual?.type === 'video' ? [asset] : [])),
  );
  const tracks = ref<MediaTrack[]>(['V1', 'A1']);
  const busy = ref(0);
  const linkSubtitles = ref(false);
  const disabled = computed(() => blocked() || busy.value > 0);
  const duration = computed(() => sequenceDuration(clips.value));
  type Snapshot = {
    clips: MediaClip[];
    raw: string;
    selectedId: string | null;
    subtitlesChanged?: boolean;
  };
  const past = ref<Snapshot[]>([]);
  const future = ref<Snapshot[]>([]);
  let transaction: Snapshot | null = null;
  let linkedCues: SubtitleCue[] = [];
  let disposed = false;
  let queue: Promise<void> = Promise.resolve();
  const snapshot = (): Snapshot => ({
    clips: clips.value.map((clip) => ({ ...clip })),
    raw: raw.value,
    selectedId: selectedId.value,
  });
  function begin() {
    if (!transaction) {
      transaction = snapshot();
      linkedCues = subtitleEditor.items.value.map((cue) => ({ ...cue }));
    }
  }
  function commit() {
    if (
      transaction &&
      (JSON.stringify(transaction.clips) !== JSON.stringify(clips.value) ||
        transaction.raw !== raw.value)
    ) {
      transaction.subtitlesChanged = transaction.raw !== raw.value;
      past.value = [...past.value.slice(-99), transaction];
      future.value = [];
    }
    transaction = null;
  }
  function restore(value: Snapshot) {
    clips.value = value.clips
      .filter((clip) => !visualLocked.value || clip.track !== 'V1')
      .map((clip) => ({ ...clip }));
    if (value.subtitlesChanged && raw.value !== value.raw) raw.value = value.raw;
    selectedId.value = value.selectedId;
  }
  function cancel() {
    if (transaction) restore({ ...transaction, subtitlesChanged: transaction.raw !== raw.value });
    transaction = null;
  }
  function undo() {
    if (disabled.value) return;
    commit();
    const value = past.value.pop();
    if (value) {
      future.value.push({ ...snapshot(), subtitlesChanged: value.subtitlesChanged });
      restore(value);
    }
  }
  function redo() {
    if (disabled.value) return;
    const value = future.value.pop();
    if (value) {
      past.value.push({ ...snapshot(), subtitlesChanged: value.subtitlesChanged });
      restore(value);
    }
  }
  function setVisualMode(mode: 'manual' | 'auto') {
    if (disabled.value || mode === visualMode.value) return;
    cancel();
    player.pause();
    visualMode.value = mode;
    state.current.autoImageElapsed = 0;
    state.current.timelineVisual = null;
    if (mode === 'auto') {
      const keepAudio = (clip: MediaClip) => clip.track !== 'V1';
      if (selected.value?.track === 'V1') selectedId.value = null;
      clips.value = clips.value.filter(keepAudio);
      for (const entry of [...past.value, ...future.value]) {
        entry.clips = entry.clips.filter(keepAudio);
        if (!entry.clips.some((clip) => clip.id === entry.selectedId)) entry.selectedId = null;
      }
      for (const asset of assets.value)
        if (asset.visual?.type === 'video') asset.visual.element.pause();
    }
  }
  async function decode(file: File) {
    const context = new OfflineAudioContext(2, 1, 48000);
    return context.decodeAudioData(await file.arrayBuffer());
  }
  function release(asset: SequenceAsset) {
    if (asset.visual?.type === 'video') {
      asset.visual.element.pause();
      asset.visual.element.removeAttribute('src');
      asset.visual.element.load();
    }
    URL.revokeObjectURL(asset.url);
    delete resources.cacheCanvases.current[asset.url];
  }
  async function prepareAsset(file: File, kind: 'audio' | 'visual'): Promise<SequenceAsset> {
    let asset: SequenceAsset;
    if (kind === 'audio') {
      const buffer = await decode(file);
      asset = {
        id: crypto.randomUUID(),
        name: file.name,
        kind: 'audio',
        duration: buffer.duration,
        url: URL.createObjectURL(file),
        file,
        buffer,
      };
    } else {
      const video = file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|ogv)$/i.test(file.name);
      const normalized =
        video && !file.type.startsWith('video/')
          ? new File([file], file.name, { type: 'video/mp4' })
          : file;
      const visual = await media.loadVisual(normalized);
      if (!visual) throw new Error('素材載入已取消');
      const length = visual.type === 'video' ? visual.element.duration : 5;
      if (!Number.isFinite(length) || length <= 0) {
        URL.revokeObjectURL(visual.url);
        throw new Error('無法讀取長度');
      }
      asset = {
        id: visual.id,
        name: file.name,
        kind: visual.type,
        duration: length,
        url: visual.url,
        visual,
        file,
      };
      if (visual.type === 'video') visual.element.loop = false;
    }
    return asset;
  }
  function replaceProject(
    nextAssets: SequenceAsset[],
    nextClips: MediaClip[],
    mode: 'auto' | 'manual',
  ) {
    player.pause();
    assets.value.forEach(release);
    assets.value = nextAssets;
    clips.value = nextClips;
    visualMode.value = mode;
    tracks.value = nextClips.some((clip) => clip.track === 'A2')
      ? ['V1', 'A1', 'A2']
      : ['V1', 'A1'];
    selectedId.value = null;
    past.value = [];
    future.value = [];
    transaction = null;
    state.current.timelineVisual = null;
    state.current.autoImageElapsed = 0;
  }
  function importFiles(files: File[], kind: 'audio' | 'visual') {
    busy.value++;
    queue = queue
      .then(async () => {
        const failures: string[] = [];
        for (const file of files) {
          if (disposed) break;
          let asset: SequenceAsset | null = null;
          try {
            asset = await prepareAsset(file, kind);
            if (disposed) {
              release(asset);
              break;
            }
            assets.value = [...assets.value, asset];
          } catch {
            failures.push(file.name);
          }
        }
        if (failures.length && !disposed)
          reportError(`無法載入：${failures.join('、')}。其餘可用檔案已加入素材庫。`);
      })
      .finally(() => {
        busy.value--;
      });
    return queue;
  }
  function add(assetId: string, track?: MediaTrack, at?: number) {
    if (disabled.value) return;
    const asset = assetMap.value.get(assetId);
    if (!asset) return;
    const target = asset.kind === 'audio' ? (track === 'A2' ? 'A2' : 'A1') : 'V1';
    if (target === 'V1' && visualLocked.value) return;
    if (!tracks.value.includes(target)) tracks.value.push(target);
    const automatic = !transaction;
    begin();
    const clip: MediaClip = {
      id: crypto.randomUUID(),
      assetId,
      track: target,
      start: at ?? sequenceDuration(clips.value.filter((item) => item.track === target)),
      duration: asset.duration,
      trimStart: 0,
      volume: 1,
      muted: asset.kind === 'video',
    };
    clips.value = [...clips.value, clip];
    selectedId.value = clip.id;
    if (automatic) commit();
  }
  function addAll() {
    if (disabled.value) return;
    begin();
    assets.value.forEach((asset) => add(asset.id));
    commit();
  }
  function update(id: string, patch: Partial<MediaClip>) {
    if (disabled.value) return false;
    const original = clips.value.find((clip) => clip.id === id);
    const asset = original && assetMap.value.get(original.assetId);
    if (!original || !asset || (visualLocked.value && original.track === 'V1')) return false;
    const next = { ...original, ...patch, id: original.id, assetId: original.assetId };
    if (!validateClip(next, asset.kind, asset.duration)) return false;
    const shift = next.start - original.start;
    if (linkSubtitles.value && shift && subtitleEditor.disabled.value) {
      reportError('字幕軌道已鎖定，請解鎖或關閉連動字幕。');
      return false;
    }
    const automatic = !transaction;
    begin();
    const base = transaction!.clips.find((item) => item.id === id) || original;
    const totalShift = next.start - base.start;
    if (
      linkSubtitles.value &&
      next.duration === base.duration &&
      next.trimStart === base.trimStart
    ) {
      subtitleEditor.begin();
      for (const cue of linkedCues)
        if (cue.time >= base.start && cue.time < base.start + base.duration)
          subtitleEditor.update(cue.uid, {
            time: Math.max(0, cue.time + totalShift),
            endTime: Math.max(0, cue.time + totalShift) + cue.endTime - cue.time,
          });
      subtitleEditor.commit();
    }
    clips.value = clips.value.map((clip) => (clip.id === id ? next : clip));
    if (!tracks.value.includes(next.track)) tracks.value.push(next.track);
    if (automatic) commit();
    return true;
  }
  function remove() {
    if (disabled.value || !selected.value || (visualLocked.value && selected.value.track === 'V1'))
      return;
    begin();
    clips.value = clips.value.filter((clip) => clip.id !== selectedId.value);
    selectedId.value = null;
    commit();
  }
  function duplicate() {
    if (disabled.value || !selected.value || (visualLocked.value && selected.value.track === 'V1'))
      return;
    begin();
    const clip = {
      ...selected.value,
      id: crypto.randomUUID(),
      start: selected.value.start + selected.value.duration,
    };
    clips.value = [...clips.value, clip];
    selectedId.value = clip.id;
    commit();
  }
  function split(time: number) {
    const clip = selected.value;
    if (
      disabled.value ||
      !clip ||
      (visualLocked.value && clip.track === 'V1') ||
      time < clip.start + 0.05 ||
      time > clip.start + clip.duration - 0.05
    )
      return;
    begin();
    const elapsed = time - clip.start;
    const right = {
      ...clip,
      id: crypto.randomUUID(),
      start: time,
      duration: clip.duration - elapsed,
      trimStart: assetMap.value.get(clip.assetId)?.kind === 'image' ? 0 : clip.trimStart + elapsed,
    };
    clips.value = [
      ...clips.value.map((item) => (item.id === clip.id ? { ...item, duration: elapsed } : item)),
      right,
    ];
    selectedId.value = right.id;
    commit();
  }
  function removeAsset(id: string) {
    if (disabled.value || clips.value.some((clip) => clip.assetId === id)) return;
    const asset = assetMap.value.get(id);
    if (!asset) return;
    release(asset);
    assets.value = assets.value.filter((item) => item.id !== id);
    // Removed source files cannot be restored by clip undo.
    past.value = [];
    future.value = [];
  }
  async function enableVideoAudio(id: string, enabled: boolean) {
    const clip = clips.value.find((item) => item.id === id);
    const asset = clip && assetMap.value.get(clip.assetId);
    if (disabled.value || !asset || asset.kind !== 'video') return;
    if (enabled && !asset.buffer) {
      busy.value++;
      try {
        const buffer = await decode(asset.file);
        if (disposed) return;
        assets.value = assets.value.map((item) =>
          item.id === asset.id ? { ...item, buffer } : item,
        );
      } catch {
        reportError('此影片沒有可解碼的音軌，影片畫面仍可使用。');
        return;
      } finally {
        busy.value--;
      }
    }
    update(id, { muted: !enabled });
  }
  function sync(time: number, playing: boolean) {
    let active: MediaClip | undefined;
    if (!visualLocked.value) {
      for (const clip of clips.value) {
        if (
          clip.track === 'V1' &&
          time >= clip.start &&
          time < clip.start + clip.duration &&
          (!active || clip.start > active.start)
        )
          active = clip;
      }
    }
    const visual = active && assetMap.value.get(active.assetId)?.visual;
    state.current.timelineVisual = visual || null;
    for (const asset of videos.value)
      if (asset.visual?.type === 'video') {
        const video = asset.visual.element;
        if (active?.assetId === asset.id) {
          const localTime = active.trimStart + time - active.start;
          if (video.playbackRate !== 1) video.playbackRate = 1;
          if (Math.abs(video.currentTime - localTime) > (playing ? 0.15 : 0.01))
            video.currentTime = Math.min(asset.duration, localTime);
          if (playing && video.paused) void video.play().catch(() => {});
          if (!playing && !video.paused) video.pause();
        } else if (!video.paused) video.pause();
      }
  }
  function schedule(context: AudioContext, output: AudioNode, time: number, startAt: number) {
    const nodes: { source: AudioBufferSourceNode; gain: GainNode }[] = [];
    for (const clip of clips.value) {
      const asset = assetMap.value.get(clip.assetId);
      if (!asset?.buffer || clip.muted) continue;
      const window = audioWindow(clip, time);
      if (window.duration <= 0) continue;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = asset.buffer;
      gain.gain.value = clip.volume;
      source.connect(gain);
      gain.connect(output);
      source.start(startAt + window.delay, window.offset, window.duration);
      nodes.push({ source, gain });
    }
    return () =>
      nodes.forEach(({ source, gain }) => {
        source.stop();
        source.disconnect();
        gain.disconnect();
      });
  }
  watch(
    clips,
    () => {
      player.setTimeline({ duration: duration.value, schedule, sync });
    },
    { deep: true },
  );
  onBeforeUnmount(() => {
    disposed = true;
    player.pause();
    assets.value.forEach(release);
  });
  return {
    assets,
    prepareAsset,
    release,
    decode,
    replaceProject,
    visualMode,
    visualLocked,
    setVisualMode,
    clips,
    selectedId,
    selected,
    assetMap,
    tracks,
    busy,
    disabled,
    duration,
    linkSubtitles,
    importFiles,
    add,
    addAll,
    update,
    remove,
    duplicate,
    split,
    removeAsset,
    enableVideoAudio,
    begin,
    commit,
    cancel,
    undo,
    redo,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
  };
}
