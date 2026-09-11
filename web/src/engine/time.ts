export const formatPlaybackTime = (seconds: number) =>
  !seconds || isNaN(seconds)
    ? `00:00`
    : `${Math.floor(seconds / 60)
        .toString()
        .padStart(2, `0`)}:${Math.floor(seconds % 60)
        .toString()
        .padStart(2, `0`)}`;
