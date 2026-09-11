import { createBackgroundPainter } from './backgroundPainter';
import { updateFrame } from './passes/updateFrame';
import { updateBackground } from './passes/updateBackground';
import { drawBackground } from './passes/drawBackground';
import { drawAtmosphere } from './passes/drawAtmosphere';
import { drawFloatingText } from './passes/drawFloatingText';
import { drawCore } from './passes/drawCore';
import { drawTitles } from './passes/drawTitles';
import { drawLyrics } from './passes/drawLyrics';
import { drawBranding } from './passes/drawBranding';
import { drawProgress } from './passes/drawProgress';
import { createSceneLayer } from './scenes/createSceneLayer';
import { createRenderFrame } from './frame';
import type { RenderResources, RenderState, Slot } from './resources';

interface RenderLoopOptions {
  refs: RenderResources;
  stateRef: Slot<RenderState>;
  onThemeColorChange: (color: string) => void;
  onError: (message: string) => void;
}
export type RenderRuntime = RenderResources &
  ReturnType<typeof createBackgroundPainter> & {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    stateRef: Slot<RenderState>;
    onThemeColorChange: (color: string) => void;
    landscapeRenderer: ReturnType<typeof createSceneLayer>;
  };

export function startRenderLoop({
  refs,
  stateRef,
  onThemeColorChange,
  onError,
}: RenderLoopOptions) {
  const canvas = refs.canvasRef.current;
  const context = canvas?.getContext('2d', {
    alpha: false,
  });
  if (!canvas || !context) {
    return;
  }
  const runtime: RenderRuntime = {
    landscapeRenderer: createSceneLayer(onError),
    ...refs,
    canvas,
    context,
    stateRef,
    onThemeColorChange,
    ...createBackgroundPainter(context, refs),
  };

  // Each pass owns one layer; frame contains only data shared within this frame.
  const frame = createRenderFrame(stateRef.current, refs);
  function renderFrame() {
    updateFrame(frame, runtime);
    updateBackground(frame, runtime);
    drawBackground(frame, runtime);
    drawAtmosphere(frame, runtime);
    drawFloatingText(frame, runtime);
    drawCore(frame, runtime);
    drawTitles(frame, runtime);
    drawLyrics(frame, runtime);
    drawBranding(frame, runtime);
    drawProgress(frame, runtime);
    refs.animationRef.current = requestAnimationFrame(renderFrame);
  }
  refs.animationRef.current = requestAnimationFrame(renderFrame);
  return () => {
    if (refs.animationRef.current !== null) cancelAnimationFrame(refs.animationRef.current);
    runtime.landscapeRenderer.dispose();
  };
}
