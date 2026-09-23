import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue';
import {
  embeddedImageFile,
  MAX_ARRANGEMENT_BYTES,
  parseImageSubtitleArrangement,
} from '../domain/imageSubtitleArrangement';
import { sequenceDuration, type MediaClip } from '../domain/mediaSequence';
import type { SequenceAsset, useMediaSequence } from './useMediaSequence';
import type { AudioPlayer } from './useAudioPlayer';

interface ImportContext {
  sequence: ReturnType<typeof useMediaSequence>;
  player: AudioPlayer;
  busy: Ref<boolean>;
  blocked: () => boolean;
  subtitleLocked: () => boolean;
  commit: (
    assets: SequenceAsset[],
    clips: MediaClip[],
    subtitles: string,
    filename: string,
  ) => void;
  reportError: (message: string) => void;
}

export function useImageSubtitleImport(context: ImportContext) {
  const message = ref('');
  let disposed = false;
  async function open(file?: File) {
    const { sequence, player, busy, reportError } = context;
    if (!file || disposed || busy.value || context.blocked() || sequence.busy.value) return false;
    if (context.subtitleLocked()) {
      reportError('請先解鎖字幕軌道，再匯入圖片字幕 JSON。');
      return false;
    }
    busy.value = true;
    message.value = '';
    reportError('');
    const prepared: SequenceAsset[] = [];
    let committed = false;
    try {
      if (file.size > MAX_ARRANGEMENT_BYTES) throw new Error('JSON 檔案不能超過 64 MiB。');
      const arrangement = parseImageSubtitleArrangement(
        await file.text(),
        sequenceDuration(sequence.clips.value.filter((clip) => clip.track !== 'V1')),
      );
      const resolved = new Map<string, SequenceAsset>();
      // Resolve all local references before allocating new media resources.
      for (const scene of arrangement.scenes) {
        if (scene.image.startsWith('data:')) continue;
        const matches = sequence.assets.value.filter(
          (asset) => asset.kind === 'image' && asset.name === scene.image,
        );
        if (matches.length !== 1)
          throw new Error(
            matches.length
              ? `素材庫有多張同名圖片「${scene.image}」，請使用唯一檔名。`
              : `素材庫找不到圖片「${scene.image}」，請先加入圖片素材。`,
          );
        resolved.set(scene.image, matches[0]);
      }
      for (const scene of arrangement.scenes) {
        if (disposed) return false;
        if (resolved.has(scene.image)) continue;
        const asset = await sequence.prepareAsset(
          embeddedImageFile(scene.image, scene.name),
          'visual',
        );
        prepared.push(asset);
        if (asset.kind !== 'image') throw new Error(`「${scene.name}」必須是圖片。`);
        resolved.set(scene.image, asset);
      }
      if (disposed) return false;
      const clips: MediaClip[] = arrangement.scenes.map((scene) => ({
        id: crypto.randomUUID(),
        assetId: resolved.get(scene.image)!.id,
        track: 'V1',
        start: scene.start,
        duration: scene.duration,
        trimStart: 0,
        volume: 1,
        muted: false,
      }));
      context.commit(
        prepared,
        clips,
        arrangement.subtitles,
        file.name.replace(/\.json$/i, '') + '.srt',
      );
      committed = true;
      await nextTick();
      player.seek(0);
      message.value = `已編排 ${clips.length} 個圖片片段、${arrangement.cueCount} 句字幕，圖片已連續貼齊至作品結尾，可播放或拖曳時間軸預覽。`;
    } catch (cause) {
      if (!disposed)
        reportError(
          `圖片字幕匯入失敗：${cause instanceof Error ? cause.message : '無法讀取檔案。'}目前作品已保留。`,
        );
    } finally {
      if (!committed) prepared.forEach(sequence.release);
      busy.value = false;
    }
    return committed;
  }
  onBeforeUnmount(() => {
    disposed = true;
  });
  return { open, message };
}
