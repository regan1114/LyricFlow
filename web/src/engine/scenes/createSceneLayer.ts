import { isLandscapeId, type SceneSettings } from '../../config/scenes';
import type { SceneRenderer } from './SceneRenderer';

export function createSceneLayer(onError: (message: string) => void) {
  let renderer: SceneRenderer | null = null;
  let loading = false;
  let retryAfter = 0;
  let disposed = false;
  return {
    render(
      sceneId: unknown,
      settings: SceneSettings,
      width: number,
      height: number,
      deltaSeconds: number,
    ) {
      if (disposed || !isLandscapeId(sceneId)) return null;
      if (!renderer && !loading && performance.now() >= retryAfter) {
        loading = true;
        void import('./SceneRenderer')
          .then((module) => {
            if (!disposed) renderer = new module.SceneRenderer(onError);
          })
          .catch(() => {
            retryAfter = performance.now() + 5000;
            if (!disposed) onError('場景動畫載入失敗，目前顯示靜態背景。');
          })
          .finally(() => {
            loading = false;
          });
      }
      return renderer?.render(sceneId, settings, width, height, deltaSeconds) ?? null;
    },
    dispose() {
      disposed = true;
      renderer?.dispose();
    },
  };
}
