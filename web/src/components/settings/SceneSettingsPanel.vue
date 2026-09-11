<script setup lang="ts">
import { computed } from 'vue';
import { LocateFixed } from '@lucide/vue';
import { useStudio } from '../../composables/useStudio';
import {
  sceneSettingFields,
  isLandscapeId,
  sceneDefinitions,
  type SceneSettingField,
} from '../../config/scenes';
import { getCanvasSize, type SettingValue } from '../../config/settings';
import * as hallstatt from '../../engine/scenes/hallstattModel';
import SettingField from './SettingField.vue';

const { settings, sceneSettings, recording } = useStudio();
const activeScene = computed(() =>
  isLandscapeId(settings.scenePreset) ? settings.scenePreset : null,
);
const fields = computed(() =>
  (activeScene.value ? (sceneSettingFields[activeScene.value] ?? []) : []).filter(
    (field) => field.key !== 'hallstattMoonPhase' || sceneSettings.hallstattMode === 'night',
  ),
);
const hallMode = computed(() => (sceneSettings.hallstattMode === 'night' ? 'night' : 'day'));
const hallRange = computed(() =>
  activeScene.value === 'hallstatt'
    ? hallstatt.makeRange(hallMode.value, sceneSettings.hallstattDate)
    : null,
);
const view = computed(() => {
  const [width, height] = getCanvasSize(settings.aspectRatio);
  return hallstatt.viewport(width, height);
});
const sky = computed(() =>
  hallRange.value
    ? hallstatt.ephemeris(hallMode.value, hallRange.value, sceneSettings.hallstattProgress / 100)
    : null,
);
const bestTime = computed(() =>
  hallRange.value ? hallstatt.bestProgress(hallMode.value, hallRange.value, view.value) : null,
);
const skyStatus = computed(() =>
  sky.value
    ? {
        visible: '位於可見天空',
        outside: '位於鏡頭之外',
        mountain: '被山稜遮住',
        horizon: '在地平線下',
      }[hallstatt.viewportStatus(sky.value.body, view.value)]
    : '',
);
const dates = { day: '2026-10-20', night: '2026-08-28' };
const animationField: SceneSettingField = {
  key: 'sceneAnimationEnabled',
  label: '場景動畫',
  type: 'checkbox',
  value: true,
};

function chooseBestTime() {
  if (bestTime.value !== null) sceneSettings.hallstattProgress = bestTime.value * 100;
}

function updateField(field: SceneSettingField, value: SettingValue) {
  if (recording.isRecording.value) return;
  if (field.key === 'hallstattDate') {
    if (!hallstatt.validDate(String(value))) return;
    sceneSettings.hallstattMoonPhase = 'date';
  }
  if (field.key === 'hallstattMode') {
    dates[hallMode.value] = sceneSettings.hallstattDate;
    sceneSettings.hallstattDate = dates[value === 'night' ? 'night' : 'day'];
    sceneSettings.hallstattMoonPhase = 'date';
  }
  Object.assign(sceneSettings, { [field.key]: value });
  if (field.key === 'hallstattMoonPhase' && value !== 'date') {
    sceneSettings.hallstattDate = hallstatt.phaseNight(Number(value), sceneSettings.hallstattDate);
  }
  if (['hallstattMode', 'hallstattDate', 'hallstattMoonPhase'].includes(field.key))
    chooseBestTime();
}
</script>

<template>
  <div
    v-if="activeScene"
    class="scene-settings"
    :aria-label="`${sceneDefinitions[activeScene].name}專屬特效設定`"
  >
    <div class="scene-settings-heading">{{ sceneDefinitions[activeScene].name }}特效</div>
    <SettingField
      v-for="field in fields"
      :key="field.key"
      :field="field"
      :model-value="sceneSettings[field.key]"
      :disabled="recording.isRecording.value"
      @update:model-value="updateField(field, $event)"
    />
    <div
      v-if="sky"
      class="scene-celestial-state"
    >
      <span>{{ sky.dateLabel }} {{ sky.clock }} · 奧地利</span>
      <span>{{ skyStatus }} · 仰角 {{ sky.body.altitude.toFixed(1) }}°</span>
      <button
        type="button"
        :disabled="bestTime === null || recording.isRecording.value"
        @click="chooseBestTime"
      >
        <LocateFixed :size="14" /> 可見時刻
      </button>
      <a
        href="/scenes/hallstatt-attribution.txt"
        target="_blank"
        rel="noopener"
        >影像來源與授權</a
      >
    </div>
    <SettingField
      v-model="sceneSettings.sceneAnimationEnabled"
      :field="animationField"
      :disabled="recording.isRecording.value"
    />
  </div>
</template>
