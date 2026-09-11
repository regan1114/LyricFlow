import { autoImageFrame } from '../../domain/autoImages';
import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
export function updateBackground(frame: RenderFrame, runtime: RenderRuntime) {
  const { stateRef, videoRefs } = runtime;
  if (stateRef.current.lastBgSwitchTime === null) {
    stateRef.current.lastBgSwitchTime = frame.trueTime;
    stateRef.current.currentBgStartTime = frame.trueTime;
  }
  frame.intervalSeconds = frame.bgInterval || 7;
  frame.transitionSeconds = 1.5;
  const elapsedBackgroundTime = frame.trueTime - stateRef.current.lastBgSwitchTime;
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
    frame.bgList = frame.bgList.filter((media) => media.type === 'image');
    stateRef.current.autoImageElapsed = frame.bgList.length
      ? stateRef.current.autoImageElapsed + Math.max(0, frame.deltaSeconds)
      : 0;
    const automatic = autoImageFrame(
      stateRef.current.autoImageElapsed,
      frame.bgList.length,
      frame.intervalSeconds,
      frame.bgSwitchTrigger === 'lyric' ? frame.parsedLyrics.map((cue) => cue.time) : undefined,
      Math.max(0, ...frame.parsedLyrics.map((cue) => cue.endTime)),
    );
    stateRef.current.currentBgIndex = automatic.current;
    stateRef.current.nextBgIndex = automatic.next;
    stateRef.current.isBgTransitioning = automatic.transitioning;
    stateRef.current.currentBgStartTime = automatic.start;
    stateRef.current.bgTransitionStart = automatic.transitionStart;
    frame.transitionProgress = automatic.progress;
    stateRef.current.lastActiveIdx = frame.activeLyricIndex;
    return;
  }
  if (stateRef.current.timelineVisual) {
    frame.bgList = [stateRef.current.timelineVisual];
    stateRef.current.currentBgIndex = 0;
    stateRef.current.nextBgIndex = 0;
    stateRef.current.isBgTransitioning = false;
    frame.transitionProgress = 0;
    stateRef.current.lastActiveIdx = frame.activeLyricIndex;
    return;
  }
  let shouldSwitchBackground = false;
  if (frame.bgList.length > 1 && !stateRef.current.isBgTransitioning) {
    if (frame.bgSwitchTrigger === `lyric`) {
      if (
        frame.isPlaying &&
        frame.activeLyricIndex !== -1 &&
        stateRef.current.lastActiveIdx !== -1 &&
        frame.activeLyricIndex !== stateRef.current.lastActiveIdx
      ) {
        shouldSwitchBackground = true;
      }
    } else {
      const currentMedia = frame.bgList[stateRef.current.currentBgIndex];
      if (currentMedia && currentMedia.type === `video`) {
        if (frame.videoTransitionMode === `strict`) {
          if (elapsedBackgroundTime > frame.intervalSeconds) {
            shouldSwitchBackground = true;
          }
        } else {
          const currentVideo = videoRefs.current[currentMedia.url];
          if (currentVideo && currentVideo.readyState >= 2 && currentVideo.duration > 0) {
            if (currentVideo.currentTime >= currentVideo.duration - 0.2 || currentVideo.ended) {
              shouldSwitchBackground = true;
            }
          } else {
            if (elapsedBackgroundTime > frame.intervalSeconds) {
              shouldSwitchBackground = true;
            }
          }
        }
      } else {
        if (elapsedBackgroundTime > frame.intervalSeconds) {
          shouldSwitchBackground = true;
        }
      }
    }
  }
  if (frame.activeLyricIndex !== stateRef.current.lastActiveIdx) {
    stateRef.current.lastActiveIdx = frame.activeLyricIndex;
  }
  if (shouldSwitchBackground) {
    stateRef.current.isBgTransitioning = true;
    stateRef.current.bgTransitionStart = frame.trueTime;
    if (frame.bgPlayMode === `random`) {
      if (!stateRef.current.randomBgQueue || stateRef.current.randomBgQueue.length === 0) {
        const queue = frame.bgList.map((_media, mediaIndex) => mediaIndex);
        for (let index = queue.length - 1; index > 0; index--) {
          const randomIndex = Math.floor(Math.random() * (index + 1));
          [queue[index], queue[randomIndex]] = [queue[randomIndex], queue[index]];
        }
        if (queue.length > 1 && queue[0] === stateRef.current.currentBgIndex) {
          const firstIndex = queue[0];
          queue[0] = queue[queue.length - 1];
          queue[queue.length - 1] = firstIndex;
        }
        stateRef.current.randomBgQueue = queue;
      }
      stateRef.current.nextBgIndex = stateRef.current.randomBgQueue.shift() ?? 0;
    } else {
      stateRef.current.nextBgIndex = (stateRef.current.currentBgIndex + 1) % frame.bgList.length;
    }
  }
  frame.transitionProgress = 0;
  if (
    stateRef.current.isBgTransitioning &&
    ((frame.transitionProgress =
      (frame.trueTime - stateRef.current.bgTransitionStart) / frame.transitionSeconds),
    frame.transitionProgress >= 1)
  ) {
    frame.transitionProgress = 1;
    stateRef.current.isBgTransitioning = false;
    const currentMedia = frame.bgList[stateRef.current.currentBgIndex];
    if (currentMedia && currentMedia.type === `video` && videoRefs.current[currentMedia.url]) {
      videoRefs.current[currentMedia.url].currentTime = 0;
    }
    stateRef.current.currentBgIndex = stateRef.current.nextBgIndex;
    stateRef.current.lastBgSwitchTime = frame.trueTime;
    stateRef.current.currentBgStartTime = stateRef.current.bgTransitionStart;
  }
  frame.bgList.forEach((media, mediaIndex) => {
    const active = mediaIndex === stateRef.current.currentBgIndex;
    const transitioning =
      stateRef.current.isBgTransitioning && mediaIndex === stateRef.current.nextBgIndex;
    const video = videoRefs.current[media.url];
    if (media.type === `video` && video) {
      if (video.playbackRate !== frame.videoSpeed) {
        video.playbackRate = frame.videoSpeed;
      }
      if (frame.isPlaying && (active || transitioning)) {
        if (video.paused && !video.ended && !video._playPending) {
          video._playPending = true;
          const playPromise = video.play();
          if (playPromise === undefined) {
            video._playPending = false;
          } else {
            playPromise
              .then(() => {
                video._playPending = false;
              })
              .catch(() => {
                video._playPending = false;
              });
          }
        }
      } else {
        if (!video.paused && !video._playPending) {
          video.pause();
        }
      }
    }
  });
}
