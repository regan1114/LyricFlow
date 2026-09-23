import { parseSubtitles, serializeSrt, type SubtitleCue } from './subtitles';

export const MAX_ARRANGEMENT_BYTES = 64 * 1024 * 1024;
export interface ImageSubtitleScene {
  image: string;
  name: string;
  start: number;
  duration: number;
  cues: SubtitleCue[];
}
export interface ImageSubtitleArrangement {
  scenes: ImageSubtitleScene[];
  subtitles: string;
  cueCount: number;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('JSON 須包含 version 與 scenes。');
  return value as Record<string, unknown>;
}

function readTimedContent(scene: Record<string, unknown>, label: string): SubtitleCue[] {
  const { startTime, endTime, content } = scene;
  if (
    typeof startTime !== 'number' ||
    typeof endTime !== 'number' ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    startTime < 0 ||
    endTime < 0
  )
    throw new Error(`${label}的 startTime 與 endTime 須為 0 以上的秒數，可含小數。`);
  const start = Math.round(startTime * 1000);
  const end = Math.round(endTime * 1000);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end - start < 50)
    throw new Error(`${label}的 endTime 須晚於 startTime 至少 0.05 秒。`);
  if (typeof content !== 'string' || !content.trim())
    throw new Error(`${label}的 content 須為非空白歌詞文字。`);
  const [text, subText = '', ...third] = content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return [
    {
      time: start / 1000,
      endTime: end / 1000,
      text,
      subText,
      thirdText: third.join('\n'),
      uid: `0_${start / 1000}`,
      animType: 0,
    },
  ];
}

// Validate every block before using the existing, deliberately forgiving subtitle parser.
function readSrt(value: unknown, label: string): SubtitleCue[] {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}缺少 SRT 歌詞。`);
  const blocks = value
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n/);
  const timing =
    /^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})\s*-->\s*(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})$/;
  for (const [index, block] of blocks.entries()) {
    const lines = block.trim().split('\n');
    const match = lines[1]?.trim().match(timing);
    if (!/^\d+$/.test(lines[0].trim()) || !match || !lines.slice(2).join('\n').trim())
      throw new Error(`${label}第 ${index + 1} 段 SRT 格式錯誤，須包含編號、起訖時間與歌詞。`);
    const milliseconds = (offset: number) =>
      Number(match[offset]) * 3600000 +
      Number(match[offset + 1]) * 60000 +
      Number(match[offset + 2]) * 1000 +
      Number(match[offset + 3]);
    const start = milliseconds(1);
    const end = milliseconds(5);
    if (!Number.isSafeInteger(end) || end - start < 50)
      throw new Error(`${label}第 ${index + 1} 段 SRT 結束時間須晚於開始至少 0.05 秒。`);
  }
  const cues = parseSubtitles(blocks.join('\n\n'));
  for (let index = 1; index < cues.length; index++)
    if (cues[index].time < cues[index - 1].endTime)
      throw new Error(`${label}的 SRT 時間重疊，請調整後再匯入。`);
  return cues;
}

export function parseImageSubtitleArrangement(
  text: string,
  audioDuration = 0,
): ImageSubtitleArrangement {
  let input: unknown;
  try {
    input = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('JSON 格式錯誤，請檢查引號、逗號及換行跳脫字元。');
  }
  const data = object(input);
  if (data.version !== 1) throw new Error('圖片字幕 JSON 的 version 必須為 1。');
  if (!Array.isArray(data.scenes) || !data.scenes.length || data.scenes.length > 500)
    throw new Error('scenes 必須包含 1～500 個圖片字幕段落。');
  const scenes = data.scenes
    .map((value, index): ImageSubtitleScene => {
      const scene = object(value);
      const label = `第 ${index + 1} 個圖片段落`;
      if (scene.name !== undefined && (typeof scene.name !== 'string' || !scene.name.trim()))
        throw new Error(`${label}的 name 須為非空白文字。`);
      if (scene.image !== undefined && (typeof scene.image !== 'string' || !scene.image.trim()))
        throw new Error(`${label}的 image 須為非空白圖片檔名或內嵌圖片。`);
      // Name-only arrangements reference existing assets; keep legacy image sources supported.
      const source = scene.image === undefined ? scene.name : scene.image;
      if (typeof source !== 'string') throw new Error(`${label}缺少 name 圖片檔名。`);
      const image = source.trim();
      if (scene.image !== undefined && image.startsWith('data:')) {
        if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))
          throw new Error(`${label}的內嵌圖片須為 PNG、JPEG 或 WebP 的 Base64 data URL。`);
      } else if (/[/\\:]/.test(image)) {
        throw new Error(`${label}請填素材庫中的圖片檔名，或內嵌圖片；不支援網址或本機路徑。`);
      }
      const extension = image.match(/^data:image\/(png|jpeg|webp);/)?.[1];
      const name =
        typeof scene.name === 'string'
          ? scene.name.trim()
          : extension
            ? `圖片-${index + 1}.${extension}`
            : image;
      // Older downloaded JSON files remain importable; partial new fields must not fall back.
      const usesTimedContent = ['startTime', 'endTime', 'content'].some((key) => key in scene);
      const cues =
        usesTimedContent || !('srt' in scene)
          ? readTimedContent(scene, label)
          : readSrt(scene.srt, label);
      const start = cues[0].time;
      return {
        image,
        name,
        start,
        duration: Math.round((cues[cues.length - 1].endTime - start) * 1000) / 1000,
        cues,
      };
    })
    .sort((first, second) => first.start - second.start);
  for (let index = 1; index < scenes.length; index++) {
    const previous = scenes[index - 1];
    if (
      Math.round(scenes[index].start * 1000) <
      Math.round((previous.start + previous.duration) * 1000)
    )
      throw new Error(`圖片「${previous.name}」與「${scenes[index].name}」的時間範圍重疊。`);
  }
  const cues = scenes.flatMap((scene) => scene.cues);
  const endMilliseconds = Math.max(
    Math.round(cues[cues.length - 1].endTime * 1000),
    Math.ceil(audioDuration * 1000),
  );
  // Images bridge lyric pauses; subtitle cue times remain unchanged.
  const alignedScenes = scenes.map((scene, index) => {
    const start = index === 0 ? 0 : scene.start;
    const nextStart = scenes[index + 1]?.start;
    return {
      ...scene,
      start,
      duration:
        ((nextStart === undefined ? endMilliseconds : Math.round(nextStart * 1000)) -
          Math.round(start * 1000)) /
        1000,
    };
  });
  return { scenes: alignedScenes, subtitles: serializeSrt(cues), cueCount: cues.length };
}

export function embeddedImageFile(source: string, name: string): File {
  const [header, encoded] = source.split(',');
  try {
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    return new File([bytes], name, { type: header.slice(5, header.indexOf(';')) });
  } catch {
    throw new Error(`圖片「${name}」的 Base64 資料無效。`);
  }
}
