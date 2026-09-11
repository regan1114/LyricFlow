import { createRenderResources, createRenderState } from '../../src/engine/resources';
import { createSettings } from '../../src/config/settings';
import { createRenderFrame } from '../../src/engine/frame';
import { updateBackground } from '../../src/engine/passes/updateBackground';
import type { RenderRuntime } from '../../src/engine/renderer';
import { describe, expect, it } from 'vitest';
import { autoImageFrame } from '../../src/domain/autoImages';

describe('automatic image playback', () => {
  it('derives transitions and repeat cycles from slideshow elapsed time', () => {
    expect(autoImageFrame(0, 3, 7)).toMatchObject({ current: 0, transitioning: false });
    expect(autoImageFrame(7.75, 3, 7)).toMatchObject({ current: 0, next: 1, progress: 0.5 });
    expect(autoImageFrame(9, 3, 7)).toMatchObject({ current: 1, transitioning: false });
    expect(autoImageFrame(23, 3, 7)).toMatchObject({ current: 0, transitioning: false });
    expect(autoImageFrame(7.75, 3, 7)).toMatchObject({ current: 0, next: 1, progress: 0.5 });
  });
  it('changes on distinct lyric lines, shortening transitions for closely spaced cues', () => {
    const times = [1, 4, 4, 5, 9];
    expect(autoImageFrame(2, 3, 7, times).current).toBe(0);
    expect(autoImageFrame(4.5, 3, 7, times)).toMatchObject({ current: 0, next: 1, progress: 0.5 });
    expect(autoImageFrame(7, 3, 7, times)).toMatchObject({ current: 2, transitioning: false });
    expect(autoImageFrame(3, 3, 7, times).current).toBe(0);
  });
  it('keeps empty, single-image and lyric-free arrangements stable', () => {
    expect(autoImageFrame(99, 0, 7)).toMatchObject({ current: 0, next: 0, transitioning: false });
    expect(autoImageFrame(7.5, 1, 7)).toMatchObject({ current: 0, transitioning: false });
    expect(autoImageFrame(100, 3, 7, [])).toMatchObject({ current: 2, transitioning: false });
  });
  it('repeats subtitle rhythm using its own elapsed time', () => {
    expect(autoImageFrame(12.75, 3, 7, [1, 4, 5, 9], 12)).toMatchObject({
      current: 0,
      next: 1,
      progress: 0.5,
    });
    expect(autoImageFrame(14, 3, 7, [1, 4, 5, 9], 12)).toMatchObject({
      current: 1,
      transitioning: false,
    });
  });

  it('continues while paused and ignores timeline seeks and playback completion', () => {
    const resources = createRenderResources();
    const state = createRenderState(createSettings());
    state.bgList = ['one', 'two', 'three'].map((name) => ({
      id: name,
      name,
      url: name,
      type: 'image',
      element: {} as HTMLImageElement,
    }));
    const frame = createRenderFrame(state, resources);
    const runtime = {
      stateRef: { current: state },
      videoRefs: resources.videoRefs,
    } as RenderRuntime;
    frame.deltaSeconds = 7.75;
    frame.currentTime = 0;
    frame.isPlaying = false;
    updateBackground(frame, runtime);
    expect(state.autoImageElapsed).toBe(7.75);
    expect(state.nextBgIndex).toBe(1);
    expect(frame.transitionProgress).toBe(0.5);
    frame.deltaSeconds = 1.25;
    frame.currentTime = 99;
    frame.isPlaying = true;
    updateBackground(frame, runtime);
    expect(state.autoImageElapsed).toBe(9);
    expect(state.currentBgIndex).toBe(1);
    frame.currentTime = 0;
    frame.isPlaying = false;
    frame.deltaSeconds = 14;
    updateBackground(frame, runtime);
    expect(state.autoImageElapsed).toBe(23);
    expect(state.currentBgIndex).toBe(0);
  });
});
