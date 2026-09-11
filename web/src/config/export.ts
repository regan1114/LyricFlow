export interface ExportSettings {
  resolution: 'original' | '720' | '1080';
  fps: 30 | 60;
  bitrate: 4 | 8 | 16;
  format: 'auto' | 'mp4' | 'webm';
  range: 'all' | 'custom';
  start: number;
  end: number;
}
export const createExportSettings = (): ExportSettings => ({
  resolution: 'original',
  fps: 60,
  bitrate: 16,
  format: 'auto',
  range: 'all',
  start: 0,
  end: 0,
});
export function exportDimensions(
  width: number,
  height: number,
  resolution: ExportSettings['resolution'],
) {
  const scale =
    resolution === 'original' ? 1 : Math.min(1, Number(resolution) / Math.min(width, height));
  return [Math.round((width * scale) / 2) * 2, Math.round((height * scale) / 2) * 2] as const;
}
export function exportRange(settings: ExportSettings, duration: number) {
  const start = settings.range === 'all' ? 0 : settings.start;
  const end = settings.range === 'all' ? duration : settings.end;
  if (![start, end].every(Number.isFinite) || start < 0 || end > duration || end <= start)
    throw new Error('請設定有效的匯出區段：結束時間需晚於開始時間，且不能超過作品長度。');
  return { start, end };
}
export function estimatedExportBytes(seconds: number, bitrate: number) {
  return (Math.max(0, seconds) * (bitrate * 1000000 + 128000)) / 8;
}
export function recordingMime(
  format: ExportSettings['format'],
  supported: (mime: string) => boolean,
) {
  return [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ].find((mime) => (format === 'auto' || mime.startsWith(`video/${format}`)) && supported(mime));
}
