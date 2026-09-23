import { computed, inject, reactive, ref, watch, watchEffect, type InjectionKey } from 'vue';
import { createExportSettings } from '../config/export';
import { useProject } from './useProject';
import { usePresets } from './usePresets';
import { createSettings } from '../config/settings';
import { createRenderResources, createRenderState, normalizeFontFamily } from '../engine/resources';
import { useAudioPlayer } from './useAudioPlayer';
import { useMediaLibrary, type LayerKind } from './useMediaLibrary';
import { useRecording } from './useRecording';
import { useAutoRecognition } from './useAutoRecognition';
import { useLyrics } from './useLyrics';
import { useSubtitleEditor } from './useSubtitleEditor';
import { useMediaSequence } from './useMediaSequence';
import { useImageSubtitleImport } from './useImageSubtitleImport';
import { ensureFontLoaded } from '../config/fonts';
import { sceneDefinitions, createSceneSettings, isLandscapeId } from '../config/scenes';
import { createImageRhythm } from '../domain/autoImages';

export function createStudio() {
  const settings = reactive(createSettings());
  const exportSettings = reactive(createExportSettings());
  const projectBusy = ref(false);
  const recognitionBusy = ref(false);
  const recognition = useAutoRecognition(recognitionBusy);
  const sceneSettings = reactive(createSceneSettings());
  sceneSettings.sceneAnimationEnabled = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const error = ref('');
  const reportError = (message: string) => {
    error.value = message;
  };
  const resources = createRenderResources();
  const renderState = { current: createRenderState(settings) };
  const player = useAudioPlayer(resources, renderState, reportError);
  const media = useMediaLibrary(resources, settings, reportError);
  const lyrics = useLyrics(player, settings, reportError);
  const recording = useRecording(
    resources,
    renderState,
    player,
    settings,
    reportError,
    exportSettings,
    () => recognitionBusy.value || projectBusy.value,
  );
  const subtitleEditor = useSubtitleEditor(
    lyrics.raw,
    () =>
      recognitionBusy.value ||
      projectBusy.value ||
      lyrics.isSyncing.value ||
      recording.isRecording.value,
  );
  const mediaTab = ref<'captions' | 'assets'>('captions');
  const sequence = useMediaSequence(
    media,
    player,
    resources,
    renderState,
    subtitleEditor,
    lyrics.raw,
    () =>
      recognitionBusy.value ||
      projectBusy.value ||
      recording.isRecording.value ||
      lyrics.isSyncing.value,
    reportError,
  );
  let firstAudioActivated = false;
  watch(
    () => [
      sequence.busy.value,
      sequence.assets.value,
      recording.isRecording.value,
      lyrics.isSyncing.value,
    ],
    () => {
      if (firstAudioActivated || sequence.disabled.value) return;
      const firstAudio = sequence.assets.value.find((asset) => asset.kind === 'audio');
      if (!firstAudio) return;
      sequence.add(firstAudio.id, 'A1', 0);
      firstAudioActivated = true;
      if (!settings.songName) settings.songName = firstAudio.name.replace(/\.[^.]+$/, '');
    },
  );
  const subtitleFilename = ref('');
  const subtitleSourceRevision = ref(0);
  let subtitleRequest = 0;
  const presets = usePresets(
    settings,
    sceneSettings,
    () =>
      recognitionBusy.value ||
      projectBusy.value ||
      recording.isRecording.value ||
      lyrics.isSyncing.value,
    reportError,
  );
  const project = useProject({
    settings,
    sceneSettings,
    exportSettings,
    sequence,
    media,
    player,
    raw: lyrics.raw,
    subtitleFilename,
    afterCommit: () => {
      subtitleSourceRevision.value++;
      subtitleEditor.resetHistory();
      firstAudioActivated = sequence.assets.value.some((asset) => asset.kind === 'audio');
    },
    busy: projectBusy,
    blocked: () => recognitionBusy.value || recording.isRecording.value || lyrics.isSyncing.value,
    beforeCommit: () => {
      firstAudioActivated = true;
      subtitleRequest++;
      presets.clearUndo();
    },
    reportError,
  });
  const activeFont = computed(() =>
    normalizeFontFamily(
      settings.selectedFont === 'custom' ? settings.customFontInput : settings.selectedFont,
    ),
  );

  const imageSubtitleImport = useImageSubtitleImport({
    sequence,
    player,
    busy: projectBusy,
    blocked: () => recognitionBusy.value || recording.isRecording.value || lyrics.isSyncing.value,
    subtitleLocked: () => subtitleEditor.locked.value,
    commit: (assets, clips, subtitles, filename) => {
      subtitleRequest++;
      lyrics.cancel();
      sequence.applyImageSubtitleArrangement(assets, clips);
      lyrics.raw.value = subtitles;
      subtitleFilename.value = filename;
      subtitleSourceRevision.value++;
      subtitleEditor.resetHistory();
      mediaTab.value = 'assets';
    },
    reportError,
  });

  const activeBackgrounds = computed(() => {
    if (!sequence.visualLocked.value) return media.backgrounds.value;
    const images = sequence.assets.value.flatMap((asset) =>
      asset.kind === 'image' && asset.visual ? [asset.visual] : [],
    );
    // Asset IDs stay stable, so seeking and exporting use the same shuffled order.
    return settings.bgPlayMode === 'random'
      ? images.sort((first, second) => first.id.localeCompare(second.id))
      : images;
  });
  const imageRhythm = computed(() =>
    createImageRhythm(
      lyrics.cues.value.map((cue) => cue.time),
      Math.max(0, ...lyrics.cues.value.map((cue) => cue.endTime)),
    ),
  );
  watchEffect(() => {
    Object.assign(renderState.current, settings, {
      sceneSettings: { ...sceneSettings },
      customFont: activeFont.value,
      bgList: activeBackgrounds.value,
      visualArrangementMode: sequence.visualMode.value,
      parsedLyrics: lyrics.cues.value,
      imageRhythm: imageRhythm.value,
      rawLyrics: lyrics.raw.value,
      logoType: media.layers.value.logo?.type ?? null,
      coreMediaType: media.layers.value.core?.type ?? null,
    });
  });
  watch(activeBackgrounds, (backgrounds, previous) => {
    if (
      backgrounds.length === previous.length &&
      backgrounds.every((image, index) => image.url === previous[index].url)
    )
      return;
    renderState.current.autoImageElapsed = 0;
    Object.assign(renderState.current, {
      currentBgIndex: 0,
      nextBgIndex: 0,
      isBgTransitioning: false,
      currentBgStartTime: renderState.current.trueTime,
    });
  });
  watch(
    () => [activeFont.value, settings.lyricsEffect, settings.keywordsStr, settings.lyricsSize],
    () => {
      resources.textCacheRef.current.clear();
      resources.effectParticlesRef.current = {};
    },
  );
  watch(
    () => settings.scenePreset,
    async (scenePreset) => {
      media.cancelBackgroundLoad();
      if (scenePreset === 'custom') return;
      if (scenePreset === 'none') {
        media.clearBackgrounds();
        return;
      }
      if (!isLandscapeId(scenePreset)) return;
      const scene = sceneDefinitions[scenePreset];
      try {
        await media.setBuiltInBackground(scene.url, scene.name);
      } catch {
        if (settings.scenePreset === scenePreset) reportError(`無法載入${scene.name}場景。`);
      }
    },
    { flush: 'sync' },
  );
  watch(
    () => settings.selectedFont,
    async (fontFamily) => {
      if (fontFamily === 'custom') return;
      try {
        await ensureFontLoaded(fontFamily);
        resources.textCacheRef.current.clear();
      } catch {
        reportError('字型載入失敗，請重新選擇字型。');
      }
    },
    { immediate: true },
  );

  async function importFiles(
    kind: 'audio' | 'background' | 'subtitles' | LayerKind,
    files: FileList | File[],
  ) {
    if (!files.length || recognitionBusy.value || projectBusy.value || recording.isRecording.value)
      return;
    error.value = '';
    try {
      if (kind === 'audio') {
        mediaTab.value = 'assets';
        await sequence.importFiles([...files], 'audio');
      } else if (kind === 'background') {
        mediaTab.value = 'assets';
        await sequence.importFiles([...files], 'visual');
      } else if (kind === 'subtitles') {
        if (subtitleEditor.locked.value) {
          reportError('請先解鎖字幕軌道再匯入字幕。');
          return;
        }
        const request = ++subtitleRequest;
        const text = await files[0].text();
        if (request !== subtitleRequest || recognitionBusy.value || recording.isRecording.value)
          return;
        lyrics.cancel();
        lyrics.raw.value = text;
        subtitleFilename.value = files[0].name;
        subtitleSourceRevision.value++;
        mediaTab.value = 'captions';
      } else await media.setLayer(kind, files[0]);
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : '匯入失敗。');
    }
  }

  return {
    recognition,
    settings,
    exportSettings,
    project,
    presets,
    activeBackgrounds,
    sequence,
    mediaTab,
    subtitleFilename,
    subtitleSourceRevision,
    sceneSettings,
    error,
    reportError,
    resources,
    renderState,
    player,
    media,
    lyrics,
    subtitleEditor,
    recording,
    importFiles,
    imageSubtitleImport,
  };
}

export type Studio = ReturnType<typeof createStudio>;
export const studioKey: InjectionKey<Studio> = Symbol('resonance-studio');

export function useStudio() {
  const studio = inject(studioKey);
  if (!studio) throw new Error('Studio components must be descendants of App.');
  return studio;
}
