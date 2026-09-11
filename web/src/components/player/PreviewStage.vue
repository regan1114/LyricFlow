<script setup lang="ts">
import { ref } from 'vue';
import { useStudio } from '../../composables/useStudio';
import { useCanvasRenderer } from '../../composables/useCanvasRenderer';
const studio = useStudio();
const { canvas, dimensions, movePointer } = useCanvasRenderer(studio);
const keyboardNavigation = ref(false);
</script>

<template>
  <div
    class="preview-stage"
    :class="{
      portrait: studio.settings.aspectRatio === '9:16',
      square: studio.settings.aspectRatio === '1:1',
      'keyboard-navigation': keyboardNavigation,
    }"
    :style="{ aspectRatio: `${dimensions[0]} / ${dimensions[1]}` }"
    tabindex="0"
    aria-label="MV 播放區"
    @pointermove="movePointer"
    @keydown.tab="keyboardNavigation = true"
    @pointerdown.capture="keyboardNavigation = false"
    @pointerleave="keyboardNavigation = false"
  >
    <canvas
      ref="canvas"
      :width="dimensions[0]"
      :height="dimensions[1]"
      aria-label="MV 即時預覽"
    />
    <slot />
  </div>
</template>
