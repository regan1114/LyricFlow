// Use elapsed slideshow time, independent of the audio/video playhead.
export function autoImageFrame(
  time: number,
  count: number,
  interval: number,
  lyricTimes?: number[],
  lyricDuration = 0,
) {
  time = Math.max(0, time);
  interval = Math.max(0.05, interval);
  const changes =
    lyricTimes &&
    [...new Set(lyricTimes.filter((start) => Number.isFinite(start) && start >= 0))]
      .sort((first, second) => first - second)
      .slice(1);
  let step = Math.floor(time / interval);
  let start = step * interval;
  let previousStart = Math.max(0, (step - 1) * interval);
  let nextStart = (step + 1) * interval;
  if (changes?.length) {
    const starts = [0, ...changes];
    const length = Math.max(lyricDuration, changes[changes.length - 1] + 0.05);
    const cycle = Math.floor(time / length);
    const localTime = time - cycle * length;
    const position = changes.filter((change) => change <= localTime).length;
    step = cycle * starts.length + position;
    start = cycle * length + starts[position];
    previousStart =
      position > 0
        ? cycle * length + starts[position - 1]
        : Math.max(0, (cycle - 1) * length + starts[starts.length - 1]);
    nextStart =
      position + 1 < starts.length ? cycle * length + starts[position + 1] : (cycle + 1) * length;
  }
  const transition = Math.min(1.5, nextStart - start);
  const progress = step > 0 && count > 1 ? Math.min(1, (time - start) / transition) : 1;
  const next = count ? step % count : 0;
  return {
    current: progress < 1 ? (step - 1) % count : next,
    next,
    progress,
    transitioning: progress < 1,
    start: progress < 1 ? previousStart : start,
    transitionStart: start,
  };
}
