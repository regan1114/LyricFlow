const lrcTag = /\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/g;
const srtTiming = /(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})/;

interface ParsedLine {
  time: number;
  endTime?: number;
  text: string;
  subText: string;
  thirdText: string;
}
export interface SubtitleCue extends ParsedLine {
  endTime: number;
  uid: string;
  animType: number;
}

function lyricText(text: string) {
  const [main = '', sub = '', ...third] = text.split('|');
  return { text: main.trim(), subText: sub.trim(), thirdText: third.join('\n').trim() };
}

function parseSrt(text: string): ParsedLine[] {
  return text.split(/\n\s*\n/).flatMap((block) => {
    const lines = block.trim().split('\n');
    const index = lines.findIndex((line) => srtTiming.test(line));
    if (index < 0) return [];
    const match = lines[index].match(srtTiming);
    if (!match) return [];
    const timeAt = (start: number) =>
      Number(match[start]) * 3600 +
      Number(match[start + 1]) * 60 +
      Number(match[start + 2]) +
      Number(match[start + 3]) / 1000;
    const time = timeAt(1);
    const endTime = timeAt(5);
    if (endTime <= time) return [];
    return [{ time, endTime, ...lyricText(lines.slice(index + 1).join('|')) }];
  });
}

export function parseSubtitles(raw: string): SubtitleCue[] {
  const text = raw.replace(/\r/g, '').trim();
  const cues: ParsedLine[] = text.includes('-->')
    ? parseSrt(text)
    : text.split('\n').flatMap((line) => {
        const matches = [...line.matchAll(lrcTag)];
        return matches
          .filter((match) => Number(match[2]) < 60)
          .map((match) => ({
            time: Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`),
            ...lyricText(line.replace(lrcTag, '')),
          }));
      });
  return cues
    .sort((firstCue, secondCue) => firstCue.time - secondCue.time)
    .map((cue, index, all) => ({
      ...cue,
      endTime: cue.endTime ?? all[index + 1]?.time ?? cue.time + 6,
      animType: index % 12,
      uid: `${index}_${cue.time}`,
    }));
}

export function formatLrcTime(seconds: number) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const minutes = Math.floor(centiseconds / 6000);
  return `[${String(minutes).padStart(2, '0')}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}]`;
}

export function formatSrtTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds / 60000) % 60;
  const secs = Math.floor(milliseconds / 1000) % 60;
  return `${[hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':')},${String(milliseconds % 1000).padStart(3, '0')}`;
}

export function serializeLrc(cues: Pick<SubtitleCue, 'time' | 'text' | 'subText' | 'thirdText'>[]) {
  return cues
    .map(
      (cue) =>
        `${formatLrcTime(cue.time)} ${[cue.text, cue.subText, cue.thirdText].filter(Boolean).join(' | ')}`,
    )
    .join('\n');
}

export function serializeSrt(
  cues: Pick<SubtitleCue, 'time' | 'endTime' | 'text' | 'subText' | 'thirdText'>[],
) {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTime(cue.time)} --> ${formatSrtTime(cue.endTime)}\n${[cue.text, cue.subText, cue.thirdText].filter(Boolean).join('\n')}\n`,
    )
    .join('\n');
}

export function getUntimedLines(raw: string) {
  if (raw.includes('-->'))
    return parseSubtitles(raw).map((cue) =>
      [cue.text, cue.subText, cue.thirdText].filter(Boolean).join(' | '),
    );
  return raw
    .replace(lrcTag, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[a-z]+:/i.test(line));
}
