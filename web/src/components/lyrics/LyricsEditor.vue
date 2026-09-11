<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight, Download, X } from '@lucide/vue';
import { useStudio } from '../../composables/useStudio';
import IconButton from '../ui/IconButton.vue';
import CaptionList from './CaptionList.vue';
import MediaLibraryPanel from './MediaLibraryPanel.vue';
const emit = defineEmits(['close']);
const { lyrics, subtitleEditor: editor, recording, mediaTab: mode } = useStudio();
onBeforeUnmount(() => editor.commit());
const { isSyncing, syncLines, syncIndex } = lyrics;
const activeLine = ref<HTMLElement | null>(null);
const syncContainer = ref<HTMLElement | null>(null);
function close() {
  if (isSyncing.value) lyrics.cancel();
  emit('close');
}
watch(syncIndex, async () => {
  await nextTick();
  activeLine.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
watch(isSyncing, async (syncing) => {
  if (syncing) {
    await nextTick();
    syncContainer.value?.focus();
  }
});
</script>

<template>
  <section
    class="lyrics-panel"
    :class="{ 'is-syncing': isSyncing }"
    aria-labelledby="lyrics-title"
    @keydown.esc.prevent="close"
  >
    <header>
      <h2 id="lyrics-title">{{ isSyncing ? '歌詞對時' : '歌詞編輯' }}</h2>
      <IconButton
        label="關閉歌詞編輯"
        @click="close"
        ><X :size="19"
      /></IconButton>
    </header>
    <div
      v-if="isSyncing"
      ref="syncContainer"
      class="sync-lines"
      tabindex="0"
    >
      <p
        v-for="(line, index) in syncLines"
        :key="index"
        :ref="
          (element) => {
            if (index === syncIndex) activeLine = element as HTMLElement;
          }
        "
        :class="{ current: index === syncIndex, stamped: index < syncIndex }"
      >
        {{ line }}
      </p>
    </div>
    <template v-else>
      <nav
        class="caption-tabs"
        aria-label="字幕編輯模式"
      >
        <button
          :aria-pressed="mode === 'assets'"
          @click="mode = 'assets'"
        >
          素材
        </button>
        <button
          :aria-pressed="mode === 'captions'"
          @click="mode = 'captions'"
        >
          逐句字幕
        </button>
      </nav>
      <MediaLibraryPanel v-if="mode === 'assets'" />
      <CaptionList v-else />
    </template>
    <footer
      v-if="isSyncing"
      class="editor-actions"
    >
      <IconButton
        label="復原上一句"
        @click="lyrics.undo"
        ><ArrowLeft :size="18"
      /></IconButton>
      <button
        type="button"
        @click="lyrics.stamp(true)"
      >
        空白時間點
      </button>
      <IconButton
        label="標記目前歌詞"
        :disabled="syncIndex >= syncLines.length"
        @click="lyrics.stamp()"
        ><ArrowRight :size="18"
      /></IconButton>
      <button
        type="button"
        class="primary"
        @click="lyrics.finish"
      >
        完成對時
      </button>
      <button
        type="button"
        @click="lyrics.cancel"
      >
        取消
      </button>
    </footer>
    <footer
      v-else-if="mode !== 'assets'"
      class="editor-actions"
    >
      <button
        type="button"
        @click="lyrics.exportFile('lrc')"
      >
        <Download :size="15" />LRC
      </button>
      <button
        type="button"
        @click="lyrics.exportFile('srt')"
      >
        <Download :size="15" />SRT
      </button>
      <button
        type="button"
        class="primary"
        :disabled="editor.disabled.value || recording.isRecording.value"
        @click="lyrics.startSync()"
      >
        開始對時
      </button>
    </footer>
  </section>
</template>
