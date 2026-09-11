import type { RenderResources, RenderState } from './resources';

export function createRenderFrame(state: RenderState, resources: RenderResources) {
  return {
    ...state,
    width: 0,
    height: 0,
    deltaSeconds: 0,
    frameStep: 0,
    playbackClock: 0,
    safeBass: 0,
    safeMid: 0,
    impactFactor: 1,
    intervalSeconds: 7,
    transitionSeconds: 1.5,
    transitionProgress: 0,
    activeLyricIndex: -1,
    frequencyData: resources.frequencyDataRef.current,
    waveformData: resources.waveformDataRef.current,
  };
}

export type RenderFrame = ReturnType<typeof createRenderFrame>;
