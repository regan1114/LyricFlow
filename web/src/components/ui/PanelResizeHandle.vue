<script setup lang="ts">
import { ref } from 'vue';
const props = defineProps<{
  label: string;
  orientation: 'horizontal' | 'vertical';
  value: number;
}>();
const emit = defineEmits<{ resize: [delta: number]; reset: [] }>();
const dragging = ref(false);
let previous = 0;
function start(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  previous = props.orientation === 'vertical' ? event.clientX : event.clientY;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  dragging.value = true;
}
function move(event: PointerEvent) {
  if (!dragging.value) return;
  const position = props.orientation === 'vertical' ? event.clientX : event.clientY;
  emit('resize', position - previous);
  previous = position;
}
function keyboard(event: KeyboardEvent) {
  const keys =
    props.orientation === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  if (keys.includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    emit('resize', (event.key === keys[0] ? -1 : 1) * (event.shiftKey ? 30 : 10));
  } else if (event.key === 'Home') {
    event.preventDefault();
    emit('reset');
  }
}
</script>

<template>
  <div
    class="panel-resize-handle"
    :class="[orientation, { dragging }]"
    role="separator"
    tabindex="0"
    :aria-label="label"
    :aria-orientation="orientation"
    :aria-valuenow="Math.round(value)"
    :title="`${label}；拖曳或使用方向鍵，雙擊恢復預設`"
    @pointerdown="start"
    @pointermove="move"
    @pointerup="dragging = false"
    @pointercancel="dragging = false"
    @lostpointercapture="dragging = false"
    @keydown="keyboard"
    @dblclick="emit('reset')"
  >
    <i />
  </div>
</template>
