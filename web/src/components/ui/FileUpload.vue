<script setup lang="ts">
import { ref } from 'vue';
import { Upload } from '@lucide/vue';
defineProps({
  label: { type: String, required: true },
  accept: { type: String, required: true },
  multiple: Boolean,
  disabled: Boolean,
});
const emit = defineEmits(['select']);
const input = ref<HTMLInputElement | null>(null);
function selectFiles(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('select', [...(target.files ?? [])]);
  target.value = '';
}
</script>

<template>
  <button
    type="button"
    class="upload-button"
    :disabled="disabled"
    @click="input?.click()"
  >
    <Upload
      :size="15"
      aria-hidden="true"
    />{{ label }}
  </button>
  <input
    ref="input"
    hidden
    type="file"
    :aria-label="label"
    :accept="accept"
    :multiple="multiple"
    :disabled="disabled"
    @change="selectFiles"
  />
</template>
