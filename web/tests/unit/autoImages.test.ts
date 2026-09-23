import { createRenderResources, createRenderState } from '../../src/engine/resources';
import { createSettings } from '../../src/config/settings';
import { createRenderFrame } from '../../src/engine/frame';
import { updateBackground } from '../../src/engine/passes/updateBackground';
import type { RenderRuntime } from '../../src/engine/renderer';
import { describe, expect, it } from 'vitest';
import { autoImageFrame, createImageRhythm } from '../../src/domain/autoImages';

describe('automatic image playback', () => {
  it('normalizes lyric rhythm once and keeps repeated cycles stable at cue boundaries', () => {
    const input = [9, 4, NaN, -1, 1, 5, 4, Infinity];
    const rhythm = createImageRhythm(input, 12)!;
    expect(rhythm.starts).toEqual([0, 4, 5, 9]);
    expect(input[0]).toBe(9);
    for (const [time, next] of [
      [0, 0],
      [4, 1],
      [5, 2],
      [9, 3],
      [12, 4],
      [16, 5],
    ])
      expect(autoImageFrame(time, 6, 7, rhythm).next).toBe(next);
    expect(rhythm.starts).toEqual([0, 4, 5, 9]);
    expect(createImageRhythm([1, 1, NaN])).toBeUndefined();
  });

  it('returns to the built-in scene after a timeline clip ends without a stale transition', () => {
    const resources = createRenderResources();
    const state = createRenderState(createSettings());
    const scene = {
      id: 'scene',
      name: 'scene',
      url: 'scene',
      type: 'image' as const,
      element: {} as HTMLImageElement,
    };
    const clip = { ...scene, id: 'clip', url: 'clip' };
    state.visualArrangementMode = 'manual';
    state.bgList = [scene];
    state.timelineVisual = clip;
    state.currentBgIndex = 8;
    state.isBgTransitioning = true;
    const frame = createRenderFrame(state, resources);
    const runtime = { stateRef: { current: state } } as RenderRuntime;
    updateBackground(frame, runtime);
    expect(frame.bgList).toEqual([clip]);
    expect(state.currentBgIndex).toBe(0);
    expect(state.isBgTransitioning).toBe(false);
    state.timelineVisual = null;
    frame.bgList = state.bgList;
    updateBackground(frame, runtime);
    expect(frame.bgList).toEqual([scene]);
    expect(frame.transitionProgress).toBe(0);
  });
  it('derives transitions and repeat cycles from slideshow elapsed time', () => {
    expect(autoImageFrame(0, 3, 7)).toMatchObject({ current: 0, transitioning: false });
    expect(autoImageFrame(7.75, 3, 7)).toMatchObject({ current: 0, next: 1, progress: 0.5 });
    expect(autoImageFrame(9, 3, 7)).toMatchObject({ current: 1, transitioning: false });
    expect(autoImageFrame(23, 3, 7)).toMatchObject({ current: 0, transitioning: false });
    expect(autoImageFrame(7.75, 3, 7)).toMatchObject({ current: 0, next: 1, progress: 0.5 });
  });
  it('changes on distinct lyric lines, shortening transitions for closely spaced cues', () => {
    const times = createImageRhythm([1, 4, 4, 5, 9]);
    expect(autoImageFrame(2, 3, 7, times).current).toBe(0);
    expect(autoImageFrame(4.5, 3, 7, times)).toMatchObject({ current: 0, next: 1, progress: 0.5 });
    expect(autoImageFrame(7, 3, 7, times)).toMatchObject({ current: 2, transitioning: false });
    expect(autoImageFrame(3, 3, 7, times).current).toBe(0);
  });
  it('keeps empty, single-image and lyric-free arrangements stable', () => {
    expect(autoImageFrame(99, 0, 7)).toMatchObject({ current: 0, next: 0, transitioning: false });
    expect(autoImageFrame(7.5, 1, 7)).toMatchObject({ current: 0, transitioning: false });
    expect(autoImageFrame(100, 3, 7, createImageRhythm([]))).toMatchObject({
      current: 2,
      transitioning: false,
    });
  });
  it('repeats subtitle rhythm using its own elapsed time', () => {
    expect(autoImageFrame(12.75, 3, 7, createImageRhythm([1, 4, 5, 9], 12))).toMatchObject({
      current: 0,
      next: 1,
      progress: 0.5,
    });
    expect(autoImageFrame(14, 3, 7, createImageRhythm([1, 4, 5, 9], 12))).toMatchObject({
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
