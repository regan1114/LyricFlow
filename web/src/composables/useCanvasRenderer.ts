import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { getCanvasSize } from '../config/settings';
import { startRenderLoop } from '../engine/renderer';
import type { Studio } from './useStudio';

export function useCanvasRenderer(studio: Studio) {
  const canvas = ref<HTMLCanvasElement | null>(null);
  const dimensions = computed(() => getCanvasSize(studio.settings.aspectRatio));
  let stop: (() => void) | undefined;
  const clearTextCache = () => studio.resources.textCacheRef.current.clear();
  onMounted(() => {
    studio.resources.canvasRef.current = canvas.value;
    stop = startRenderLoop({
      refs: studio.resources,
      stateRef: studio.renderState,
      onError: studio.reportError,
      onThemeColorChange: (color) => {
        studio.settings.themeColor = color;
      },
    });
    document.fonts.addEventListener('loadingdone', clearTextCache);
  });
  onBeforeUnmount(() => {
    stop?.();
    document.fonts.removeEventListener('loadingdone', clearTextCache);
  });
  function movePointer(event: PointerEvent) {
    if (!canvas.value) return;
    const bounds = canvas.value.getBoundingClientRect();
    studio.renderState.current.mouseX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 85;
    studio.renderState.current.mouseY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 85;
  }
  return { canvas, dimensions, movePointer };
}
