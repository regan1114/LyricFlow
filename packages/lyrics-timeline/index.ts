/** Public exchange contract. All times, including words, are absolute seconds. */
export interface LyricWord {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}
export interface LyricSegment extends LyricWord {
  id: number;
  words?: LyricWord[];
}
export interface LyricProject {
  version: '1.0.0';
  duration: number;
  mode: 'auto_recognition' | 'known_lyrics' | 'hybrid' | 'import';
  segments: LyricSegment[];
}
export function validateProject(value: unknown): LyricProject {
  const fail = (): never => {
    throw new Error('歌詞 Timeline JSON 格式或時間無效。');
  };
  if (!value || typeof value !== 'object') return fail();
  const p = value as LyricProject;
  if (
    p.version !== '1.0.0' ||
    !Number.isFinite(p.duration) ||
    p.duration < 0 ||
    !['auto_recognition', 'known_lyrics', 'hybrid', 'import'].includes(p.mode) ||
    !Array.isArray(p.segments)
  )
    return fail();
  const ids = new Set<number>();
  let previous = 0;
  for (const s of p.segments) {
    if (!s || !Number.isInteger(s.id) || s.id < 1 || ids.has(s.id) || typeof s.text !== 'string')
      return fail();
    ids.add(s.id);
    if (
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start < previous ||
      s.end <= s.start ||
      s.end > p.duration
    )
      return fail();
    previous = s.start;
    const checkScore = (w: LyricWord) =>
      w.confidence === undefined ||
      (Number.isFinite(w.confidence) && w.confidence >= 0 && w.confidence <= 1);
    if (!checkScore(s)) return fail();
    if (s.words !== undefined) {
      if (!Array.isArray(s.words) || !s.words.length) return fail();
      let last = s.start;
      for (const w of s.words) {
        if (
          !w ||
          typeof w.text !== 'string' ||
          !w.text ||
          !Number.isFinite(w.start) ||
          !Number.isFinite(w.end) ||
          w.start < last ||
          w.end <= w.start ||
          w.end > s.end ||
          !checkScore(w)
        )
          return fail();
        last = w.end;
      }
      if (s.words.map((w) => w.text).join('') !== s.text) return fail();
    }
  }
  return {
    version: p.version,
    duration: p.duration,
    mode: p.mode,
    segments: p.segments.map((s) => ({
      id: s.id,
      start: s.start,
      end: s.end,
      text: s.text,
      ...(s.confidence === undefined ? {} : { confidence: s.confidence }),
      ...(s.words === undefined ? {} : { words: s.words.map((w) => ({ ...w })) }),
    })),
  };
}
export function timelineSrt(value: LyricProject): string {
  const p = validateProject(value);
  const stamp = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    return (
      [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60]
        .map((n) => String(n).padStart(2, '0'))
        .join(':') +
      ',' +
      String(ms % 1000).padStart(3, '0')
    );
  };
  return p.segments
    .map((s, i) => {
      if (stamp(s.start) === stamp(s.end)) throw new Error('字幕短於 SRT 毫秒精度。');
      return `${i + 1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.text}\n`;
    })
    .join('\n');
}
