import type { SubtitleCue } from '../domain/subtitles';
import type { TextBitmap } from './textBitmap';
import { tintTextCanvas } from './lyrics';
const tinted = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
export function wordHighlightSpans(cue: SubtitleCue, time: number) {
  if (
    !cue.words?.length ||
    cue.words.map((word) => word.text).join('') !== cue.text ||
    time < cue.time ||
    time >= cue.endTime
  )
    return [];
  let offset = 0;
  return cue.words.map((word) => {
    const from = offset;
    offset += word.text.length;
    return {
      from,
      to: offset,
      progress: Math.max(0, Math.min(1, (time - word.start) / (word.end - word.start))),
    };
  });
}
export function drawWordHighlight(
  context: CanvasRenderingContext2D,
  bitmap: TextBitmap,
  cue: SubtitleCue,
  time: number,
  x: number,
  y: number,
) {
  const spans = wordHighlightSpans(cue, time);
  if (!spans.length || !bitmap.glyphs) return;
  let highlight = tinted.get(bitmap.canvas);
  if (!highlight) {
    highlight = tintTextCanvas(bitmap.canvas, '#ffe27a');
    tinted.set(bitmap.canvas, highlight);
  }
  context.save();
  context.beginPath();
  for (const span of spans) {
    const glyphs = bitmap.glyphs.filter((glyph) => glyph.from >= span.from && glyph.to <= span.to);
    let remaining = glyphs.reduce((sum, glyph) => sum + glyph.width, 0) * span.progress;
    for (const glyph of glyphs) {
      context.rect(
        x + glyph.x,
        y + glyph.y,
        Math.max(0, Math.min(glyph.width, remaining)),
        glyph.height,
      );
      remaining -= glyph.width;
    }
  }
  context.clip();
  context.drawImage(highlight, x, y);
  context.restore();
}
