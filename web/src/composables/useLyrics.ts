import { computed, onBeforeUnmount, ref } from 'vue';
import { defaultLyrics } from '../config/settings';
import {
  formatLrcTime,
  getUntimedLines,
  parseSubtitles,
  serializeLrc,
  serializeSrt,
} from '../domain/subtitles';
import { downloadText } from '../services/download';
import type { AudioPlayer } from './useAudioPlayer';
import type { StudioSettings } from '../config/settings';

export function useLyrics(
  player: AudioPlayer,
  settings: StudioSettings,
  reportError: (message: string) => void,
) {
  const raw = ref(defaultLyrics);
  const cues = computed(() => parseSubtitles(raw.value));
  const isSyncing = ref(false);
  const syncLines = ref<string[]>([]);
  const syncIndex = ref(0);
  let history: { lines: string[]; index: number }[] = [];
  let syncRequest = 0;

  async function startSync() {
    const request = ++syncRequest;
    if (!player.isLoaded.value) {
      reportError('請先匯入音訊。');
      return;
    }
    const lines = getUntimedLines(raw.value);
    if (!lines.length) {
      reportError('請先輸入歌詞。');
      return;
    }
    syncLines.value = lines;
    syncIndex.value = 0;
    history = [];
    player.seek(0);
    try {
      await player.play();
      if (request === syncRequest) isSyncing.value = true;
    } catch {
      if (request === syncRequest) reportError('無法開始歌詞對時，請重新播放。');
    }
  }

  function stamp(blank = false) {
    if (!isSyncing.value || (!blank && syncIndex.value >= syncLines.value.length)) return;
    history.push({ lines: [...syncLines.value], index: syncIndex.value });
    const timestamp = formatLrcTime(player.getCurrentTime());
    if (blank) syncLines.value.splice(syncIndex.value, 0, `${timestamp} `);
    else syncLines.value[syncIndex.value] = `${timestamp} ${syncLines.value[syncIndex.value]}`;
    syncIndex.value++;
  }
  function undo() {
    const previous = history.pop();
    if (previous) {
      syncLines.value = previous.lines;
      syncIndex.value = previous.index;
    }
  }
  function finish() {
    raw.value = syncLines.value.join('\n');
    isSyncing.value = false;
    player.pause();
  }
  function cancel() {
    syncRequest++;
    isSyncing.value = false;
    player.pause();
  }
  function exportFile(format: 'lrc' | 'srt' | 'txt') {
    const text =
      format === 'srt'
        ? serializeSrt(cues.value)
        : cues.value.length
          ? serializeLrc(cues.value)
          : raw.value;
    downloadText(text, `${settings.songName || 'Lyrics'}.${format}`);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (
      !isSyncing.value ||
      (event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable="true"]'))
    )
      return;
    const actions: Partial<Record<string, () => void>> = {
      ArrowRight: () => stamp(),
      0: () => stamp(true),
      ArrowLeft: undo,
      Enter: finish,
      ' ': () => stamp(),
    };
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }
  window.addEventListener('keydown', onKeyDown);
  onBeforeUnmount(() => {
    syncRequest++;
    window.removeEventListener('keydown', onKeyDown);
  });
  return {
    raw,
    cues,
    isSyncing,
    syncLines,
    syncIndex,
    startSync,
    stamp,
    undo,
    finish,
    cancel,
    exportFile,
  };
}
