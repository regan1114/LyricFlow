<script setup lang="ts">
import { nextTick, onMounted, onUpdated, ref, watch } from 'vue';
import { useStudio } from '../../composables/useStudio';
import type { SubtitleCue } from '../../domain/subtitles';
const { subtitleEditor: editor, player, sequence, recording } = useStudio();
const { visible, selectedId, search, replacement, disabled } = editor;
const list = ref<HTMLElement | null>(null);
const notice = ref('');
function select(cue: SubtitleCue, seek = false) {
  sequence.selectedId.value = null;
  selectedId.value = cue.uid;
  if (seek && !recording.isRecording.value) player.seek(cue.time);
}
function resize(element: HTMLTextAreaElement) {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}
function resizeLines() {
  list.value?.querySelectorAll('textarea').forEach(resize);
}
onMounted(resizeLines);
onUpdated(resizeLines);
function paste(cue: SubtitleCue, event: ClipboardEvent) {
  const value = event.clipboardData?.getData('text/plain');
  if (!value?.includes('\n') || disabled.value) return;
  event.preventDefault();
  const input = event.target as HTMLTextAreaElement;
  editor.pasteLines(
    cue.uid,
    input.value.slice(0, input.selectionStart) + value + input.value.slice(input.selectionEnd),
  );
}
function text(cue: SubtitleCue, event: Event) {
  const [main = '', sub = '', ...third] = (event.target as HTMLTextAreaElement).value.split('\n');
  editor.update(cue.uid, { text: main, subText: sub, thirdText: third.join('\n') });
  resize(event.target as HTMLTextAreaElement);
}
watch(selectedId, async () => {
  await nextTick();
  list.value?.querySelector('.caption-row.selected')?.scrollIntoView({ block: 'nearest' });
});
</script>

<template>
  <div class="caption-editor">
    <div class="caption-search">
      <input
        v-model="search"
        type="search"
        aria-label="搜尋字幕"
        placeholder="搜尋字幕文字"
      />
      <div class="caption-replace">
        <input
          v-model="replacement"
          aria-label="取代文字"
          placeholder="取代為…"
        />
        <button
          :disabled="disabled || !search"
          @click="notice = `已取代 ${editor.replaceAll()} 處文字`"
        >
          全部取代
        </button>
      </div>
      <span
        v-if="notice"
        role="status"
        >{{ notice }}</span
      >
    </div>
    <div class="caption-list-heading">
      <span>{{ visible.length }} 段字幕</span>
      <button
        :disabled="disabled"
        @click="editor.add(player.currentTime.value)"
      >
        新增字幕
      </button>
    </div>
    <p
      v-if="editor.locked.value"
      class="caption-notice"
    >
      字幕軌道已鎖定，解鎖後即可修改。
    </p>
    <div
      ref="list"
      class="caption-line-list"
    >
      <article
        v-for="cue in visible"
        :key="cue.uid"
        class="caption-row"
        :class="{
          selected: editor.selectedSet.value.has(cue.uid),
          playing: player.currentTime.value >= cue.time && player.currentTime.value < cue.endTime,
        }"
      >
        <button
          class="caption-jump"
          :aria-label="`選取字幕 ${editor.items.value.indexOf(cue) + 1}`"
          @click="select(cue, true)"
        >
          <b>{{ editor.items.value.indexOf(cue) + 1 }}</b>
        </button>
        <textarea
          :aria-label="`字幕 ${editor.items.value.indexOf(cue) + 1} 文字`"
          :value="[cue.text, cue.subText, cue.thirdText].filter(Boolean).join('\n')"
          :disabled="disabled"
          rows="1"
          placeholder="輸入歌詞，可貼上多行自動分句"
          spellcheck="false"
          @paste="paste(cue, $event)"
          @focus="
            select(cue);
            editor.begin();
          "
          @input="text(cue, $event)"
          @blur="editor.commit()"
        />
      </article>
      <p
        v-if="!visible.length"
        class="caption-notice"
      >
        {{
          editor.items.value.length
            ? '找不到符合的字幕。'
            : '新增字幕後輸入或貼上歌詞，也可匯入 TXT／LRC／SRT。'
        }}
      </p>
    </div>
  </div>
</template>
