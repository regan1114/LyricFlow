<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStudio } from '../../composables/useStudio';
import { estimatedExportBytes, exportDimensions } from '../../config/export';
import { getCanvasSize } from '../../config/settings';
import { MAX_RECORDING_BYTES } from '../../services/recordingBuffer';
import FileUpload from '../ui/FileUpload.vue';
const {
  settings,
  exportSettings,
  player,
  project,
  presets,
  recording,
  sequence,
  lyrics,
  recognition,
} = useStudio();
const draft = project.drafts;
const draftDate = computed(() =>
  draft.current.value ? new Date(draft.current.value.savedAt).toLocaleString('zh-TW') : '',
);
const name = ref('');
const selected = ref('ballad');
const blocked = computed(
  () =>
    project.busy.value ||
    project.drafts.working.value ||
    recognition.busy.value ||
    recording.isRecording.value ||
    lyrics.isSyncing.value ||
    sequence.busy.value > 0,
);
const dimensions = computed(() =>
  exportDimensions(...getCanvasSize(settings.aspectRatio), exportSettings.resolution),
);
const seconds = computed(() =>
  exportSettings.range === 'all'
    ? player.duration.value
    : Math.max(0, exportSettings.end - exportSettings.start),
);
const bytes = computed(() => estimatedExportBytes(seconds.value, exportSettings.bitrate));
function saveStyle() {
  if (presets.save(name.value)) name.value = '';
}
function removeStyle() {
  presets.remove(selected.value);
  selected.value = 'ballad';
}
</script>
<template>
  <div class="project-tools">
    <details open>
      <summary>專案與草稿</summary>
      <div class="project-section">
        <div class="project-actions">
          <button
            type="button"
            :disabled="blocked"
            @click="project.save"
          >
            儲存專案
          </button>
          <FileUpload
            label="開啟專案"
            accept=".resonance"
            :disabled="blocked"
            @select="project.open($event[0])"
          />
        </div>
        <p>專案包含素材、字幕與設定。開啟檔案會替換目前作品。</p>
        <p
          v-if="project.message.value"
          role="status"
        >
          {{ project.message.value }}
        </p>
        <div class="draft-panel">
          <label class="draft-toggle"
            ><input
              v-model="draft.enabled.value"
              type="checkbox"
              :disabled="blocked"
              aria-label="自動儲存草稿"
            />自動儲存草稿</label
          >
          <p
            class="draft-status"
            :class="{ 'draft-error': draft.error.value }"
            role="status"
          >
            {{ draft.status.value }}
          </p>
          <p
            v-if="draft.current.value"
            class="draft-details"
          >
            {{ draft.current.value.name }} · {{ draftDate }}<br />
            <template v-if="draft.current.value.mediaCount !== null"
              >{{ draft.current.value.mediaCount }} 個素材 · </template
            >{{ (draft.current.value.bytes / 1024 / 1024).toFixed(1) }} MiB
          </p>
          <div class="project-actions">
            <template v-if="draft.needsChoice.value">
              <button
                v-if="draft.current.value"
                type="button"
                :disabled="blocked"
                @click="draft.restore"
              >
                恢復草稿
              </button>
              <button
                type="button"
                :disabled="blocked"
                @click="draft.useCurrent"
              >
                以目前作品取代
              </button>
            </template>
            <button
              v-else
              type="button"
              :disabled="blocked || draft.saving.value"
              @click="draft.saveNow"
            >
              {{ draft.error.value ? '重試儲存草稿' : '立即儲存草稿' }}
            </button>
            <button
              v-if="draft.current.value"
              type="button"
              :disabled="blocked"
              @click="draft.remove"
            >
              刪除草稿
            </button>
          </div>
          <p>
            草稿只存在此瀏覽器，重新開啟時可選擇恢復。離開前請確認已儲存；重要作品請另下載專案備份。清除網站資料會一併刪除草稿。
          </p>
        </div>
      </div>
    </details>
    <details>
      <summary>風格預設</summary>
      <div class="project-section">
        <label
          >選擇風格<select
            v-model="selected"
            :disabled="blocked"
            aria-label="選擇風格"
          >
            <optgroup label="內建風格">
              <option
                v-for="preset in presets.builtIn"
                :key="preset.id"
                :value="preset.id"
              >
                {{ preset.name }}
              </option>
            </optgroup>
            <optgroup
              v-if="presets.custom.value.length"
              label="我的收藏"
            >
              <option
                v-for="preset in presets.custom.value"
                :key="preset.id"
                :value="preset.id"
              >
                {{ preset.name }}
              </option>
            </optgroup>
          </select></label
        >
        <div class="project-actions">
          <button
            type="button"
            :disabled="blocked"
            @click="presets.apply(selected)"
          >
            套用風格
          </button>
          <button
            type="button"
            :disabled="blocked || !presets.canUndo.value"
            @click="presets.undo"
          >
            復原風格
          </button>
          <button
            v-if="presets.custom.value.some((preset) => preset.id === selected)"
            type="button"
            :disabled="blocked"
            @click="removeStyle"
          >
            刪除收藏
          </button>
        </div>
        <p>
          套用配色、字型、場景與特效。自動圖片與時間軸素材仍優先顯示；場景可在手動模式的畫面空檔看見。
        </p>
        <label
          >收藏名稱<input
            v-model="name"
            aria-label="收藏名稱"
            maxlength="60"
            placeholder="例如：我的抒情頻道"
            :disabled="blocked"
            @keydown.enter.prevent="saveStyle"
        /></label>
        <button
          type="button"
          :disabled="blocked || !name.trim()"
          @click="saveStyle"
        >
          收藏目前風格
        </button>
        <p>收藏保存在這個瀏覽器；Logo 與自訂背景素材由專案檔保存。</p>
      </div>
    </details>
    <details>
      <summary>匯出設定</summary>
      <fieldset
        class="project-section"
        :disabled="blocked"
      >
        <label
          >解析度<select
            v-model="exportSettings.resolution"
            aria-label="匯出解析度"
          >
            <option value="original">原始畫布</option>
            <option value="1080">短邊 1080 px</option>
            <option value="720">短邊 720 px</option>
          </select></label
        >
        <label
          >幀率<select
            v-model="exportSettings.fps"
            aria-label="匯出幀率"
          >
            <option :value="30">30 FPS</option>
            <option :value="60">60 FPS</option>
          </select></label
        >
        <label
          >畫質<select
            v-model="exportSettings.bitrate"
            aria-label="匯出畫質"
          >
            <option :value="4">精簡 · 4 Mbps</option>
            <option :value="8">標準 · 8 Mbps</option>
            <option :value="16">高畫質 · 16 Mbps</option>
          </select></label
        >
        <label
          >格式<select
            v-model="exportSettings.format"
            aria-label="匯出格式"
          >
            <option value="auto">自動選擇</option>
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
          </select></label
        >
        <label
          >範圍<select
            v-model="exportSettings.range"
            aria-label="匯出範圍"
          >
            <option value="all">完整作品</option>
            <option value="custom">指定區段</option>
          </select></label
        >
        <template v-if="exportSettings.range === 'custom'">
          <label
            >開始（秒）<input
              v-model.number="exportSettings.start"
              type="number"
              aria-label="匯出開始秒數"
              min="0"
              :max="player.duration.value"
              step="0.01"
          /></label>
          <label
            >結束（秒）<input
              v-model.number="exportSettings.end"
              type="number"
              aria-label="匯出結束秒數"
              min="0"
              :max="player.duration.value"
              step="0.01"
          /></label>
          <button
            type="button"
            @click="exportSettings.end = player.duration.value"
          >
            結束設為作品尾端
          </button>
        </template>
        <p>
          {{ dimensions[0] }} × {{ dimensions[1] }} · {{ seconds.toFixed(1) }} 秒 · 預估
          {{ (bytes / 1024 / 1024).toFixed(1) }} MiB
        </p>
        <p
          v-if="bytes >= MAX_RECORDING_BYTES"
          class="export-warning"
          role="status"
        >
          預估超過 256 MiB 上限，可能無法完整錄製。請降低畫質或縮短區段。
        </p>
        <p>
          按播放器的錄影鍵開始即時錄製。格式依瀏覽器支援，容量僅供估算；達 256 MiB
          會停止並保存已錄片段。
        </p>
      </fieldset>
    </details>
  </div>
</template>

<style scoped>
.draft-panel {
  border-top: 1px solid var(--border, #393941);
  padding-top: 12px;
  margin-top: 2px;
}
.project-section .draft-toggle {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.project-section .draft-toggle input {
  width: 15px;
  padding: 0;
  min-height: 15px;
  margin: 0;
  accent-color: #a88bfa;
}
.draft-status {
  color: #b7dcc0;
}
.project-section .draft-error {
  color: #ffc58c;
}
.draft-details {
  overflow-wrap: anywhere;
}
</style>
