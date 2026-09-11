<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { X } from '@lucide/vue';
import { createStudio, studioKey } from './composables/useStudio';
import PreviewStage from './components/player/PreviewStage.vue';
import PlaybackControls from './components/player/PlaybackControls.vue';
import MediaToolbar from './components/player/MediaToolbar.vue';
import EffectsToolbar from './components/player/EffectsToolbar.vue';
import SettingsPanel from './components/settings/SettingsPanel.vue';
import ScenePanel from './components/settings/ScenePanel.vue';
import LyricsEditor from './components/lyrics/LyricsEditor.vue';
import SubtitleTimeline from './components/lyrics/SubtitleTimeline.vue';
import IconButton from './components/ui/IconButton.vue';
import PanelResizeHandle from './components/ui/PanelResizeHandle.vue';

const studio = createStudio();
provide(studioKey, studio);
const { error, settings } = studio;
const fullscreen = ref(false);
const showLyrics = ref(false);
const container = ref<HTMLElement | null>(null);
const lyricsWidth = ref(30);
const timelineHeight = ref<number | null>(null);
const mobileLyricsHeight = ref(480);
const mobile = ref(false);
const mobileQuery = matchMedia('(max-width: 700px)');
function updateMobile() {
  mobile.value = mobileQuery.matches;
}
function resizeLyrics(delta: number) {
  if (mobile.value) {
    mobileLyricsHeight.value = Math.max(300, Math.min(900, mobileLyricsHeight.value - delta));
    return;
  }
  const width = container.value?.clientWidth || window.innerWidth;
  lyricsWidth.value = Math.max(20, Math.min(55, lyricsWidth.value - (delta / width) * 100));
}
function resizeTimeline(delta: number) {
  const current =
    container.value?.querySelector('.subtitle-timeline')?.getBoundingClientRect().height || 220;
  const maximum = mobile.value
    ? 700
    : Math.max(160, (container.value?.clientHeight || window.innerHeight) - 320);
  timelineHeight.value = Math.max(160, Math.min(maximum, current - delta));
}
onMounted(() => {
  updateMobile();
  mobileQuery.addEventListener('change', updateMobile);
});
onBeforeUnmount(() => mobileQuery.removeEventListener('change', updateMobile));
function toggleLyrics() {
  if (showLyrics.value && studio.lyrics.isSyncing.value) studio.lyrics.cancel();
  showLyrics.value = !showLyrics.value;
}
function updateFullscreen() {
  fullscreen.value = Boolean(document.fullscreenElement);
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await container.value?.requestFullscreen();
  } catch {
    studio.reportError('此瀏覽器無法開啟全螢幕。');
  }
}
onMounted(() => document.addEventListener('fullscreenchange', updateFullscreen));
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', updateFullscreen));
</script>

<template>
  <main
    ref="container"
    :inert="studio.project.busy.value"
    class="studio"
    :class="{ fullscreen, 'lyrics-editing': showLyrics }"
    :style="{
      '--accent': settings.themeColor,
      '--lyrics-width': `${lyricsWidth}fr`,
      '--preview-width': `${100 - lyricsWidth}fr`,
      '--timeline-height': timelineHeight === null ? undefined : `${timelineHeight}px`,
      '--mobile-lyrics-height': `${mobileLyricsHeight}px`,
    }"
  >
    <PreviewStage>
      <div
        class="workspace-controls"
        :class="{ 'controls-pinned': studio.lyrics.isSyncing.value }"
      >
        <div class="top-controls">
          <SettingsPanel />
          <div class="right-controls">
            <MediaToolbar
              :fullscreen="fullscreen"
              :lyrics-open="showLyrics"
              @fullscreen="toggleFullscreen"
              @lyrics="toggleLyrics"
            />
            <EffectsToolbar />
            <ScenePanel />
          </div>
        </div>
        <PlaybackControls />
      </div>
    </PreviewStage>
    <LyricsEditor
      v-if="showLyrics"
      @close="toggleLyrics"
    />
    <SubtitleTimeline v-if="showLyrics" />
    <template v-if="showLyrics">
      <PanelResizeHandle
        class="lyrics-resize"
        :label="mobile ? '調整歌詞編輯高度' : '調整歌詞編輯寬度'"
        :orientation="mobile ? 'horizontal' : 'vertical'"
        :value="mobile ? mobileLyricsHeight : lyricsWidth"
        @resize="resizeLyrics"
        @reset="
          lyricsWidth = 30;
          mobileLyricsHeight = 480;
        "
      />
      <PanelResizeHandle
        class="timeline-resize"
        label="調整時間軸高度"
        orientation="horizontal"
        :value="timelineHeight ?? (mobile ? 440 : 380)"
        @resize="resizeTimeline"
        @reset="timelineHeight = null"
      />
    </template>
    <div
      v-if="error"
      role="alert"
      class="error-message"
    >
      <span>{{ error }}</span
      ><IconButton
        label="關閉錯誤訊息"
        @click="error = ''"
        ><X :size="16"
      /></IconButton>
    </div>
  </main>
  <div
    v-if="studio.project.busy.value"
    class="project-loading"
    role="status"
  >
    正在讀取專案與素材…
  </div>
</template>
