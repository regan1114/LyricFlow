import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { StudioSettings } from '../config/settings';
import type { SceneSettings } from '../config/scenes';
import type { ExportSettings } from '../config/export';
import { packProject, unpackProject, type ProjectData } from '../domain/project';
import { validateClip } from '../domain/mediaSequence';
import { downloadBlob } from '../services/download';
import { useProjectDraft } from './useProjectDraft';
import type { useMediaSequence, SequenceAsset } from './useMediaSequence';
import type { useMediaLibrary, LayerKind, VisualMedia } from './useMediaLibrary';
import type { AudioPlayer } from './useAudioPlayer';
interface ProjectContext {
  settings: StudioSettings;
  sceneSettings: SceneSettings;
  exportSettings: ExportSettings;
  sequence: ReturnType<typeof useMediaSequence>;
  media: ReturnType<typeof useMediaLibrary>;
  player: AudioPlayer;
  raw: Ref<string>;
  subtitleFilename: Ref<string>;
  busy: Ref<boolean>;
  blocked: () => boolean;
  beforeCommit: () => void;
  afterCommit: () => void;
  reportError: (message: string) => void;
}
const layerKinds: LayerKind[] = ['logo', 'core', 'overlay'];
export function useProject(context: ProjectContext) {
  const {
    settings,
    sceneSettings,
    exportSettings,
    sequence,
    media,
    player,
    raw,
    subtitleFilename,
    busy,
    reportError,
  } = context;
  const message = ref('');
  let disposed = false;
  function capture(): ProjectData {
    const files = sequence.assets.value.map((asset) => asset.file);
    const layers = { logo: null, core: null, overlay: null } as ProjectData['manifest']['layers'];
    for (const kind of layerKinds) {
      const file = media.layerFiles.value[kind];
      if (file) {
        layers[kind] = files.length;
        files.push(file);
      }
    }
    return {
      manifest: {
        version: 1,
        settings: { ...settings },
        sceneSettings: { ...sceneSettings },
        exportSettings: { ...exportSettings },
        lyrics: raw.value,
        subtitleFilename: subtitleFilename.value,
        visualMode: sequence.visualMode.value,
        linkSubtitles: sequence.linkSubtitles.value,
        volume: player.volume.value,
        assets: sequence.assets.value.map((asset, file) => ({
          id: asset.id,
          name: asset.name,
          kind: asset.kind,
          duration: asset.duration,
          file,
        })),
        clips: sequence.clips.value.map((clip) => ({ ...clip })),
        layers,
      },
      files,
    };
  }
  function save() {
    if (context.blocked() || busy.value || sequence.busy.value) return;
    try {
      downloadBlob(packProject(capture()), `${settings.songName || 'Resonance'}.resonance`);
      message.value = '專案已下載，包含所有匯入素材。';
    } catch {
      reportError('無法儲存專案，請確認設定值有效，並檢查下載權限或可用空間。');
    }
  }
  async function open(source: Blob | ProjectData): Promise<boolean> {
    if (context.blocked() || busy.value || sequence.busy.value) return false;
    busy.value = true;
    player.pause();
    const assets: SequenceAsset[] = [];
    const layers: { kind: LayerKind; visual: VisualMedia; file: File }[] = [];
    let committed = false;
    try {
      const { manifest, files } = source instanceof Blob ? await unpackProject(source) : source;
      for (const metadata of manifest.assets) {
        const asset = await sequence.prepareAsset(
          files[metadata.file],
          metadata.kind === 'audio' ? 'audio' : 'visual',
        );
        assets.push(asset);
        if (asset.kind !== metadata.kind) throw new Error(`素材類型不符：${metadata.name}`);
        asset.id = metadata.id;
        asset.name = metadata.name;
        if (asset.visual) asset.visual.id = metadata.id;
        if (
          asset.kind === 'video' &&
          manifest.clips.some((clip) => clip.assetId === asset.id && !clip.muted)
        )
          asset.buffer = await sequence.decode(asset.file);
        if (disposed) throw new Error('已取消載入');
      }
      for (const clip of manifest.clips) {
        const asset = assets.find((asset) => asset.id === clip.assetId)!;
        if (!validateClip(clip, asset.kind, asset.duration))
          throw new Error('片段範圍超過實際素材長度。');
      }
      for (const kind of layerKinds) {
        const index = manifest.layers[kind];
        if (index === null) continue;
        const file = files[index];
        const visual = await media.loadVisual(file);
        if (!visual) throw new Error('已取消載入');
        layers.push({ kind, visual, file });
        if (kind === 'overlay' && visual.type !== 'image') throw new Error('疊圖必須是圖片。');
      }
      if (disposed) return false;
      context.beforeCommit();
      media.clearBackgrounds();
      layerKinds.forEach((kind) => media.clearLayer(kind));
      // Force a fresh built-in scene load even when restoring the same preset.
      settings.scenePreset = 'custom';
      Object.assign(settings, manifest.settings);
      Object.assign(sceneSettings, manifest.sceneSettings);
      Object.assign(exportSettings, manifest.exportSettings);
      sequence.replaceProject(assets, manifest.clips, manifest.visualMode);
      sequence.linkSubtitles.value = manifest.linkSubtitles;
      layers.forEach(({ kind, visual, file }) => media.commitLayer(kind, visual, file));
      raw.value = manifest.lyrics;
      context.afterCommit();
      subtitleFilename.value = manifest.subtitleFilename;
      player.volume.value = manifest.volume;
      committed = true;
      await nextTick();
      player.seek(0);
      message.value = '專案已開啟。';
    } catch (error) {
      if (!disposed)
        reportError(`無法開啟專案：${error instanceof Error ? error.message : '檔案損壞'}。`);
    } finally {
      if (!committed) {
        assets.forEach(sequence.release);
        layers.forEach(({ visual }) => media.release(visual));
      }
      busy.value = false;
    }
    return committed;
  }
  async function reset() {
    if (context.blocked() || busy.value || sequence.busy.value || disposed) return;
    if (
      !window.confirm(
        '確定重置？將清空目前的媒體、字幕、編輯內容與瀏覽器草稿，並重新載入空白工作區。此操作無法復原，請先下載要保留的專案。',
      )
    )
      return;
    busy.value = true;
    player.pause();
    try {
      if (!(await drafts.clear())) {
        busy.value = false;
        reportError('草稿未能清除，尚未重置目前作品。請查看草稿狀態後重試。');
        return;
      }
      for (const key of Object.keys(localStorage)) {
        if (key === 'lyric-flow:last-job' || key.startsWith('lyric-flow:edits:'))
          localStorage.removeItem(key);
      }
      window.location.reload();
    } catch {
      reportError('無法清除瀏覽器暫存，尚未重置目前作品。請確認瀏覽器允許存取網站資料後再試。');
      busy.value = false;
    }
  }
  const drafts = useProjectDraft({
    capture,
    open,
    blocked: () => busy.value || context.blocked() || sequence.busy.value > 0,
  });
  watch(
    () => [
      settings,
      sceneSettings,
      exportSettings,
      raw.value,
      subtitleFilename.value,
      sequence.assets.value.map(({ id, file, name, kind, duration }) => ({
        id,
        file,
        name,
        kind,
        duration,
      })),
      sequence.clips.value,
      sequence.visualMode.value,
      sequence.linkSubtitles.value,
      media.layerFiles.value,
      player.volume.value,
    ],
    drafts.changed,
    { deep: true },
  );
  onBeforeUnmount(() => {
    disposed = true;
  });
  return {
    busy,
    drafts,
    message,
    save,
    open,
    reset,
  };
}
