<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, SlidersHorizontal, Trash2 } from '@lucide/vue';
import { settingGroups } from '../../config/settings';
import { useStudio } from '../../composables/useStudio';
import type { LayerKind } from '../../composables/useMediaLibrary';
import { bundledFonts } from '../../config/fonts';
import ProjectPanel from './ProjectPanel.vue';
import SettingField from './SettingField.vue';
import FileUpload from '../ui/FileUpload.vue';
import IconButton from '../ui/IconButton.vue';

const { settings, media, recording, importFiles, reportError, sequence, lyrics } = useStudio();
const { layers } = media;
const { isRecording } = recording;
const { visualMode, visualLocked } = sequence;
const autoFields = ['bgPlayMode', 'bgSwitchTrigger', 'bgInterval', 'bgTransitionStyle'];
const expanded = ref(true);
const themeColors = ['#f59e0b', '#a855f7', '#3b82f6', '#10b981', '#ef4444'];
function chooseTheme(color: string) {
  settings.themeColor = color;
  settings.colorMode = 'fixed';
}
const uploads: { kind: LayerKind; label: string; accept: string }[] = [
  { kind: 'logo', label: 'Logo', accept: 'image/*,video/*' },
  { kind: 'overlay', label: '疊圖', accept: 'image/*' },
  { kind: 'core', label: '光核圖示', accept: 'image/*,video/*' },
];
function visible(field: { key: string }) {
  if (['videoTransitionMode', 'videoSpeed'].includes(field.key)) return false;
  if (autoFields.includes(field.key))
    return (
      visualLocked.value &&
      (field.key !== 'bgInterval' ||
        settings.bgSwitchTrigger === 'time' ||
        lyrics.cues.value.length < 2)
    );
  if (field.key === 'scenePreset') return false;
  if (field.key === 'customFontInput') return settings.selectedFont === 'custom';
  if (field.key === 'classicTagline') return settings.titleStyle === 'classic';
  return true;
}
async function pickColor() {
  if (!('EyeDropper' in window)) return;
  try {
    const EyeDropper = window.EyeDropper as EyeDropperConstructor;
    const result = await new EyeDropper().open();
    settings.overlayKeyColor = result.sRGBHex;
    settings.enableColorKeying = true;
  } catch (error: unknown) {
    const name = error instanceof DOMException ? error.name : '';
    if (name !== 'AbortError') reportError('無法取得畫面顏色。');
  }
}
const canPickColor = 'EyeDropper' in window;
const selectedFont = computed(() =>
  bundledFonts.find((font) => font.value === settings.selectedFont),
);
</script>

<template>
  <aside class="settings-panel">
    <button
      type="button"
      class="panel-heading"
      :aria-expanded="expanded"
      aria-controls="settings-content"
      @click="expanded = !expanded"
    >
      <SlidersHorizontal :size="17" /><span>Resonance Dashboard</span
      ><ChevronDown
        :size="16"
        :class="{ collapsed: !expanded }"
      />
    </button>
    <div
      v-show="expanded"
      id="settings-content"
      class="settings-content"
    >
      <ProjectPanel />
      <section
        v-for="group in settingGroups"
        :key="group.id"
        :aria-label="group.label"
        class="settings-fields"
      >
        <h3 class="settings-section-title">{{ group.label }}</h3>
        <div
          v-if="group.id === 'background'"
          class="visual-arrangement"
        >
          <span class="arrangement-label">畫面編排</span>
          <div
            class="arrangement-options"
            role="group"
            aria-label="畫面編排模式"
          >
            <button
              type="button"
              :aria-pressed="visualMode === 'manual'"
              :disabled="sequence.disabled.value"
              @click="sequence.setVisualMode('manual')"
            >
              手動時間軸
            </button>
            <button
              type="button"
              :aria-pressed="visualMode === 'auto'"
              :disabled="sequence.disabled.value"
              @click="sequence.setVisualMode('auto')"
            >
              自動編排圖片
            </button>
          </div>
          <p>
            {{
              visualLocked
                ? '自動使用素材區內的所有圖片，影片不參與。畫面軌道已鎖定。'
                : '將圖片與影片加入時間軸，自行調整順序與長度。切換自動模式會清空畫面軌道，素材仍保留。'
            }}
          </p>
          <span
            v-if="visualLocked"
            class="arrangement-count"
            >{{ sequence.assets.value.filter((asset) => asset.kind === 'image').length }} 張圖片 ·
            {{
              sequence.assets.value.some((asset) => asset.kind === 'image')
                ? '獨立計時，自動循環'
                : '請先匯入圖片素材'
            }}</span
          >
          <p v-if="visualLocked">
            播放、暫停或拖曳時間軸不影響輪播。{{
              settings.bgSwitchTrigger === 'lyric'
                ? '依歌詞模式會重複使用字幕時間間距，作為獨立換頁節奏；沒有可用節奏時依輪播間隔切換。'
                : ''
            }}
          </p>
        </div>
        <div
          v-if="group.id === 'visual'"
          class="theme-swatches"
          role="group"
          aria-label="固定色彩快捷列"
        >
          <button
            v-for="color in themeColors"
            :key="color"
            type="button"
            :aria-label="`主題色 ${color}`"
            :title="`主題色 ${color}`"
            :aria-pressed="settings.colorMode === 'fixed' && settings.themeColor === color"
            :style="{ backgroundColor: color }"
            :disabled="isRecording"
            @click="chooseTheme(color)"
          />
        </div>
        <template
          v-for="field in group.fields"
          :key="field.key"
        >
          <SettingField
            v-if="visible(field)"
            v-model="settings[field.key]"
            :field="field"
            :disabled="isRecording"
          />
        </template>
        <div
          v-if="group.id === 'info' && selectedFont"
          class="font-preview"
          :style="{ fontFamily: `'${selectedFont.value}', sans-serif` }"
        >
          <strong>讓聲音，慢慢有了形狀</strong>
          <span>{{ selectedFont.label }} · {{ selectedFont.preview }}</span>
          <a
            :href="`/fonts/${selectedFont.file}-OFL.txt`"
            target="_blank"
            rel="noopener"
            >字型授權</a
          >
        </div>
        <template v-if="group.id === 'layers' || group.id === 'visual'">
          <div
            v-for="upload in uploads.filter((item) =>
              group.id === 'visual' ? item.kind === 'core' : item.kind !== 'core',
            )"
            :key="upload.kind"
            class="layer-upload"
          >
            <FileUpload
              :label="`匯入${upload.label}`"
              :accept="upload.accept"
              :disabled="isRecording"
              @select="importFiles(upload.kind, $event)"
            />
            <span
              v-if="layers[upload.kind]"
              class="filename"
              >{{ layers[upload.kind]?.name }}</span
            >
            <IconButton
              v-if="layers[upload.kind]"
              :label="`清除${upload.label}`"
              :disabled="isRecording"
              @click="media.clearLayer(upload.kind)"
              ><Trash2 :size="15"
            /></IconButton>
          </div>
        </template>
        <button
          v-if="group.id === 'layers' && canPickColor"
          type="button"
          :disabled="isRecording"
          @click="pickColor"
        >
          擷取去背顏色
        </button>
      </section>
    </div>
  </aside>
</template>
