export function parseTime(value) {
  const text = value.trim().replace(',', '.');
  if (!text) return null;
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(text)) return NaN;
  const parts = text.split(':').map(Number);
  if (parts.length > 1 && parts.at(-1) >= 60) return NaN;
  if (parts.length === 3 && parts[1] >= 60) return NaN;
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0) * 1000) / 1000;
}

export function formatTime(value, srt = false) {
  if (!Number.isFinite(value)) return '';
  let ms = Math.round(value * 1000);
  const hours = Math.floor(ms / 3600000);
  ms %= 3600000;
  const minutes = Math.floor(ms / 60000);
  ms %= 60000;
  const seconds = Math.floor(ms / 1000);
  ms %= 1000;
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return (
    (srt || hours ? `${pad(hours)}:` : '') +
    `${pad(minutes)}:${pad(seconds)}${srt ? ',' : '.'}${pad(ms, 3)}`
  );
}

export function validateRows(rows, duration) {
  const errors = new Map();
  let previousEnd = 0;
  rows.forEach((row, i) => {
    if (row.start === null && row.end === null) return;
    if (!Number.isFinite(row.start) || !Number.isFinite(row.end)) {
      errors.set(i, '請填入完整的開始與結束時間，例如 01:25.300。');
    } else if (row.start < 0 || row.end <= row.start || row.end > duration) {
      errors.set(i, '開始時間須早於結束時間，且不可超過歌曲長度。');
    } else if (row.start < previousEnd) {
      errors.set(i, '這一句與前面的字幕重疊，請調整時間。');
    }
    if (Number.isFinite(row.end)) previousEnd = Math.max(previousEnd, row.end);
  });
  return errors;
}

export function makeSrt(rows, duration) {
  const errors = validateRows(rows, duration);
  if (errors.size)
    throw new Error(`第 ${errors.keys().next().value + 1} 句：${errors.values().next().value}`);
  const timed = rows.filter((row) => Number.isFinite(row.start) && Number.isFinite(row.end));
  if (!timed.length) throw new Error('還沒有已定位的歌詞，請先設定時間。');
  return (
    '\uFEFF' +
    timed
      .map(
        (row, i) =>
          `${i + 1}\n${formatTime(row.start, true)} --> ${formatTime(row.end, true)}\n${row.text}`,
      )
      .join('\n\n') +
    '\n'
  );
}
