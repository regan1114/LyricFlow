<script setup lang="ts">
import { Captions, Maximize, Minimize, RotateCcw } from '@lucide/vue';
import { useStudio } from '../../composables/useStudio';
import { autoRecognitionEnabled } from '../../config/features';
import FileUpload from '../ui/FileUpload.vue';
import AutoRecognition from './AutoRecognition.vue';
import IconButton from '../ui/IconButton.vue';
const props = defineProps({ fullscreen: Boolean, lyricsOpen: Boolean });
const emit = defineEmits(['lyrics', 'fullscreen']);
const {
  importFiles,
  activeBackgrounds: backgrounds,
  recording,
  sequence,
  project,
  recognition,
  lyrics,
} = useStudio();
const { isRecording } = recording;
function importMedia(kind: 'audio' | 'background', files: File[]) {
  const firstAudio =
    kind === 'audio' && !sequence.assets.value.some((asset) => asset.kind === 'audio');
  if (!props.lyricsOpen && !firstAudio) emit('lyrics');
  void importFiles(kind, files);
}
</script>

<template>
  <div class="media-toolbar">
    <div class="media-actions">
      <AutoRecognition
        v-if="autoRecognitionEnabled"
        @complete="!lyricsOpen && $emit('lyrics')"
      />
      <IconButton
        label="重置"
        tooltip
        :disabled="
          isRecording ||
          project.busy.value ||
          recognition.busy.value ||
          lyrics.isSyncing.value ||
          sequence.busy.value > 0
        "
        @click="project.reset"
      >
        <RotateCcw
          :size="18"
          aria-hidden="true"
        />
      </IconButton>
      <FileUpload
        label="匯入音訊"
        accept="audio/*"
        multiple
        :disabled="isRecording"
        @select="importMedia('audio', $event)"
      />
      <FileUpload
        label="匯入字幕"
        accept=".lrc,.srt,.txt"
        :disabled="isRecording"
        @select="importFiles('subtitles', $event)"
      />
      <FileUpload
        label="匯入圖片／影片"
        accept="image/*,video/*"
        multiple
        :disabled="isRecording"
        @select="importMedia('background', $event)"
      />
      <IconButton
        label="歌詞編輯"
        :aria-pressed="lyricsOpen"
        :disabled="isRecording"
        @click="$emit('lyrics')"
        ><Captions :size="18"
      /></IconButton>
      <IconButton
        :label="fullscreen ? '離開全螢幕' : '全螢幕'"
        @click="$emit('fullscreen')"
        ><component
          :is="fullscreen ? Minimize : Maximize"
          :size="18"
      /></IconButton>
    </div>
    <div class="media-status">
      <span class="filename"
        >{{ sequence.assets.value.length }} 個素材 · {{ sequence.clips.value.length }} 個片段</span
      ><span>{{ backgrounds.length }} 個背景</span>
    </div>
  </div>
</template>
