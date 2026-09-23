import { autoImageFrame } from '../../domain/autoImages';
import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
export function updateBackground(frame: RenderFrame, runtime: RenderRuntime) {
  const { stateRef } = runtime;
  frame.intervalSeconds = frame.bgInterval || 7;
  frame.transitionSeconds = 1.5;
  frame.activeLyricIndex = -1;
  if (frame.parsedLyrics.length > 0) {
    for (let index = frame.parsedLyrics.length - 1; index >= 0; index--)
      if (
        frame.currentTime >=
        (isNaN(frame.parsedLyrics[index].time) ? 0 : frame.parsedLyrics[index].time) - 0.1
      ) {
        frame.activeLyricIndex = index;
        break;
      }
  }
  if (stateRef.current.visualArrangementMode === 'auto') {
    stateRef.current.autoImageElapsed = frame.bgList.length
      ? stateRef.current.autoImageElapsed + Math.max(0, frame.deltaSeconds)
      : 0;
    const automatic = autoImageFrame(
      stateRef.current.autoImageElapsed,
      frame.bgList.length,
      frame.intervalSeconds,
      frame.bgSwitchTrigger === 'lyric' ? stateRef.current.imageRhythm : undefined,
    );
    stateRef.current.currentBgIndex = automatic.current;
    stateRef.current.nextBgIndex = automatic.next;
    stateRef.current.isBgTransitioning = automatic.transitioning;
    stateRef.current.currentBgStartTime = automatic.start;
    stateRef.current.bgTransitionStart = automatic.transitionStart;
    frame.transitionProgress = automatic.progress;
    return;
  }
  // Manual playback uses the active clip; gaps fall back to the selected built-in scene.
  if (stateRef.current.timelineVisual) frame.bgList = [stateRef.current.timelineVisual];
  stateRef.current.currentBgIndex = 0;
  stateRef.current.nextBgIndex = 0;
  stateRef.current.isBgTransitioning = false;
  frame.transitionProgress = 0;
}
