<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown, Mountain } from '@lucide/vue';
import { settingGroups, type SettingFieldConfig, type SettingValue } from '../../config/settings';
import { isLandscapeId } from '../../config/scenes';
import { useStudio } from '../../composables/useStudio';
import SceneSettingsPanel from './SceneSettingsPanel.vue';
import SettingField from './SettingField.vue';
const { settings, sequence } = useStudio();
const expanded = ref(true);
const sceneField = settingGroups
  .flatMap<SettingFieldConfig>((group) => group.fields)
  .find((field) => field.key === 'scenePreset')!;
function chooseScene(value: SettingValue) {
  if (sequence.disabled.value) return;
  if (isLandscapeId(value)) sequence.setVisualMode('manual');
  settings.scenePreset = String(value);
}
</script>

<template>
  <aside
    class="scene-panel"
    aria-label="場景設定"
  >
    <button
      type="button"
      class="scene-panel-heading"
      :aria-expanded="expanded"
      aria-controls="scene-panel-content"
      @click="expanded = !expanded"
    >
      <Mountain :size="17" /><span>場景設定</span>
      <ChevronDown
        :size="16"
        :class="{ collapsed: !expanded }"
      />
    </button>
    <div
      v-show="expanded"
      id="scene-panel-content"
      class="scene-panel-content"
    >
      <SettingField
        :field="sceneField"
        :model-value="settings.scenePreset"
        :disabled="sequence.disabled.value"
        @update:model-value="chooseScene"
      />
      <p
        v-if="sequence.visualLocked.value"
        class="scene-entry-hint"
      >
        選擇內建場景會切換至手動時間軸，已匯入的素材會保留。
      </p>
      <SceneSettingsPanel />
    </div>
  </aside>
</template>
