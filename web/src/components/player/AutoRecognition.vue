<script setup lang="ts">
import { ScanText } from '@lucide/vue';
import IconButton from '../ui/IconButton.vue';
import { computed, nextTick, ref } from 'vue';
import { getUntimedLines } from '../../domain/subtitles';
import { useStudio } from '../../composables/useStudio';

const emit = defineEmits(['complete']);
const studio = useStudio();
const { sequence, lyrics, subtitleEditor, recognition, recording } = studio;
const dialog = ref<HTMLDialogElement | null>(null);
const songId = ref('');
const text = ref('');
let sourceText: string | undefined;
let sourceRevision = -1;
const confirming = ref(false);
const completed = ref(false);
const notice = ref('');
const songs = computed(() => sequence.assets.value.filter((asset) => asset.kind === 'audio'));
const blocked = computed(
  () =>
    recording.isRecording.value ||
    lyrics.isSyncing.value ||
    studio.project.busy.value ||
    sequence.busy.value > 0 ||
    recognition.busy.value,
);

async function open() {
  if (!songs.value.length) {
    studio.reportError('請先匯入歌曲，再使用自動辨識。');
    return;
  }
  if (blocked.value) return;
  if (subtitleEditor.locked.value) {
    studio.reportError('請先解鎖字幕軌道，再使用自動辨識。');
    return;
  }
  if (!songs.value.some((song) => song.id === songId.value)) songId.value = songs.value[0].id;
  if (sourceText !== lyrics.raw.value || sourceRevision !== studio.subtitleSourceRevision.value) {
    text.value = getUntimedLines(lyrics.raw.value).join('\n');
    sourceText = lyrics.raw.value;
    sourceRevision = studio.subtitleSourceRevision.value;
  }
  confirming.value = false;
  completed.value = false;
  notice.value = '';
  recognition.error.value = '';
  recognition.message.value = '';
  studio.player.pause();
  await nextTick();
  dialog.value?.showModal();
}
function close() {
  if (recognition.busy.value) return;
  confirming.value = false;
  dialog.value?.close();
}
function escape(event: Event) {
  event.preventDefault();
  if (confirming.value) confirming.value = false;
  else close();
}
async function submit(confirmed = false) {
  if (blocked.value || subtitleEditor.locked.value) return;
  notice.value = '';
  const song = songs.value.find((asset) => asset.id === songId.value);
  if (!song) {
    notice.value = '請先匯入歌曲。';
    return;
  }
  if (!text.value.replace(/\[[^\]]*\]|\s|\ufeff/g, '')) {
    notice.value = '請輸入實際演唱的歌詞。';
    return;
  }
  const clips = sequence.clips.value.filter(
    (clip) => clip.assetId === song.id && clip.track !== 'V1',
  );
  if (!clips.length) {
    notice.value = '請先在素材區將這首歌曲加入音軌，再開始辨識。';
    return;
  }
  if (!confirmed && (lyrics.raw.value.trim() || subtitleEditor.items.value.length)) {
    confirming.value = true;
    return;
  }
  confirming.value = false;
  subtitleEditor.commit();
  completed.value = await recognition.start(
    song.file,
    text.value,
    clips.map((clip) => ({ ...clip })),
    (srt) => {
      lyrics.raw.value = srt;
      // Keep the full submitted lyrics, including unmatched lines, until the document changes.
      sourceText = srt;
      sourceRevision = studio.subtitleSourceRevision.value;
      studio.subtitleFilename.value = song.name.replace(/\.[^.]+$/, '') + '.srt';
      studio.mediaTab.value = 'captions';
    },
  );
  if (completed.value) emit('complete');
}
</script>

<template>
  <IconButton
    label="自動辨識"
    tooltip
    :disabled="blocked"
    @click="open"
  >
    <ScanText
      :size="18"
      aria-hidden="true"
    />
  </IconButton>
  <dialog
    ref="dialog"
    class="recognition-dialog"
    aria-labelledby="recognition-title"
    @cancel="escape"
  >
    <form @submit.prevent="submit()">
      <h2 id="recognition-title">自動辨識</h2>
      <template v-if="!completed">
        <label for="recognition-song">歌曲</label>
        <select
          id="recognition-song"
          v-model="songId"
          :disabled="recognition.busy.value || confirming"
        >
          <option
            v-for="song in songs"
            :key="song.id"
            :value="song.id"
          >
            {{ song.name }}
          </option>
        </select>
        <p>辨識完整歌曲，依音軌上的位置與裁切範圍套用字幕。請輸入實際演唱的歌詞。</p>
        <label for="recognition-lyrics">歌詞</label>
        <textarea
          id="recognition-lyrics"
          v-model="text"
          rows="10"
          maxlength="12000"
          required
          placeholder="每行一句歌詞"
          :disabled="recognition.busy.value || confirming"
        />
      </template>
      <p
        v-if="notice || recognition.error.value"
        role="alert"
      >
        {{ notice || recognition.error.value }}
      </p>
      <div
        v-if="confirming"
        role="alertdialog"
        aria-labelledby="replace-title"
        aria-describedby="replace-description"
        class="replace-warning"
      >
        <h3 id="replace-title">取代現有字幕？</h3>
        <p id="replace-description">
          繼續會刪除原有的字幕，並以辨識結果取代。辨識成功前會保留原內容。
        </p>
        <div class="recognition-actions">
          <button
            type="button"
            autofocus
            @click="confirming = false"
          >
            取消
          </button>
          <button
            type="button"
            @click="submit(true)"
          >
            確認取代並辨識
          </button>
        </div>
      </div>
      <template v-else>
        <p
          v-if="recognition.message.value"
          role="status"
        >
          {{ recognition.message.value }}
        </p>
        <progress
          v-if="recognition.busy.value"
          :value="recognition.percent.value ?? undefined"
          max="100"
          aria-label="目前辨識階段進度"
        />
        <div class="recognition-actions">
          <button
            v-if="recognition.busy.value"
            type="button"
            :disabled="recognition.cancelling.value"
            @click="recognition.cancel"
          >
            {{ recognition.cancelling.value ? '正在取消…' : '取消辨識' }}
          </button>
          <template v-else>
            <button
              type="button"
              @click="close"
            >
              {{ completed ? '完成' : '取消' }}
            </button>
            <button
              v-if="!completed"
              type="submit"
              :disabled="!text.trim()"
            >
              送出
            </button>
          </template>
        </div>
      </template>
    </form>
  </dialog>
</template>

<style scoped>
.recognition-dialog {
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  overflow: auto;
  padding: 24px;
  border: 1px solid #555;
  border-radius: 16px;
  color: #eee;
  background: #1c1c20;
}
.recognition-dialog::backdrop {
  background: #000a;
  backdrop-filter: blur(5px);
}
form {
  display: grid;
  gap: 12px;
}
h2,
h3,
p {
  margin: 0;
}
p {
  font-size: 14px;
  line-height: 1.6;
}
select,
textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #666;
  border-radius: 6px;
  background: #111;
  color: #eee;
  font: inherit;
}
textarea {
  resize: vertical;
}
progress {
  width: 100%;
}
.recognition-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.recognition-actions button {
  padding: 8px 16px;
}
.replace-warning {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid #d99f39;
  border-radius: 8px;
}
</style>
