<script setup lang="ts">
import { computed } from 'vue';
import type { SettingFieldConfig, SettingValue } from '../../config/settings';

const props = defineProps<{
  field: SettingFieldConfig & { suffix?: string };
  modelValue: SettingValue;
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: SettingValue] }>();
const inputValue = computed(() => String(props.modelValue));
const checkedValue = computed(() => Boolean(props.modelValue));
function updateValue(event: Event, numeric = false) {
  const value = (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  emit('update:modelValue', numeric ? Number(value) : value);
}
function updateChecked(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <label
    class="setting-field"
    :class="{
      'toggle-field': field.type === 'checkbox',
      'stacked-field': field.type === 'range' || field.type === 'textarea',
    }"
    :for="`setting-${field.key}`"
  >
    <span
      >{{ field.label
      }}<output v-if="field.type === 'range'">{{ modelValue }}{{ field.suffix }}</output></span
    >
    <select
      v-if="field.type === 'select'"
      :id="`setting-${field.key}`"
      :aria-label="field.label"
      :value="inputValue"
      :disabled="disabled"
      @change="updateValue($event, typeof field.value === 'number')"
    >
      <option
        v-for="option in field.options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
    <textarea
      v-else-if="field.type === 'textarea'"
      :id="`setting-${field.key}`"
      :value="inputValue"
      :disabled="disabled"
      rows="3"
      @input="updateValue"
    />
    <input
      v-else-if="field.type === 'checkbox'"
      :id="`setting-${field.key}`"
      type="checkbox"
      :checked="checkedValue"
      :disabled="disabled"
      @change="updateChecked"
    />
    <input
      v-else
      :id="`setting-${field.key}`"
      :aria-label="field.label"
      :type="field.type"
      :value="inputValue"
      :min="field.min"
      :max="field.max"
      :step="field.step"
      :disabled="disabled"
      @input="updateValue($event, field.type === 'range')"
    />
  </label>
</template>
