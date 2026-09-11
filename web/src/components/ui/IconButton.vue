<script setup lang="ts">
defineProps({ label: { type: String, required: true }, active: Boolean, tooltip: Boolean });
</script>

<template>
  <button
    type="button"
    class="icon-button"
    :class="{ active }"
    :aria-label="label"
    :title="tooltip ? undefined : label"
  >
    <slot />
    <span
      v-if="tooltip"
      class="button-tooltip"
      aria-hidden="true"
      >{{ label }}</span
    >
  </button>
</template>

<style scoped>
.icon-button {
  position: relative;
}
.button-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  padding: 6px 9px;
  border: 1px solid #555;
  border-radius: 6px;
  background: #19191d;
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
}
.icon-button:hover .button-tooltip,
.icon-button:focus-visible .button-tooltip {
  visibility: visible;
  opacity: 1;
}
</style>
