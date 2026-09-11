export interface TextBitmap {
  canvas: HTMLCanvasElement;
  paddingX: number;
  paddingY: number;
  width: number;
}
interface CachedTextBitmap extends TextBitmap {
  color: string;
  paint: (color: string) => void;
}

export class TextBitmapCache {
  private readonly entries = new Map<string, CachedTextBitmap>();
  bytes = 0;
  constructor(readonly budgetBytes = 32 * 1024 * 1024) {}
  get size() {
    return this.entries.size;
  }
  get(key: string) {
    const bitmap = this.entries.get(key);
    if (bitmap) {
      this.entries.delete(key);
      this.entries.set(key, bitmap);
    }
    return bitmap;
  }
  set(key: string, bitmap: CachedTextBitmap) {
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.canvas.width * previous.canvas.height * 4;
    this.entries.delete(key);
    const bytes = bitmap.canvas.width * bitmap.canvas.height * 4;
    if (bytes > this.budgetBytes) return;
    this.entries.set(key, bitmap);
    this.bytes += bytes;
    while (this.bytes > this.budgetBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      const removed = this.entries.get(oldest)!;
      this.bytes -= removed.canvas.width * removed.canvas.height * 4;
      this.entries.delete(oldest);
    }
  }
  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}

interface TextFragment {
  text: string;
  highlighted: boolean;
}
interface MeasuredFragment extends TextFragment {
  font: string;
  width: number;
}
interface TextBitmapOptions {
  id: string;
  text: string;
  subText?: string;
  thirdText?: string;
  mainFontSize: number;
  subFontSize: number;
  glow: number;
  color: string;
  centered: boolean;
  style: string;
}
function splitHighlights(text: string, keywords: string[]): TextFragment[] {
  if (!keywords.length)
    return [
      {
        text,
        highlighted: false,
      },
    ];
  const pattern = keywords
    .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return text.split(new RegExp(`(${pattern})`, 'gi')).map((part) => ({
    text: part,
    highlighted: keywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase()),
  }));
}
function measureLine(
  context: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  fontSize: number,
  italic: boolean,
  keywords: string[],
  maxWidth: number,
) {
  const fragments = splitHighlights(text, keywords);
  const fontFor = (fragment: TextFragment, scale = 1) =>
    `${italic ? 'italic 300' : '400'} ${fontSize * scale * (fragment.highlighted ? 1.3 : 1)}px ${fontFamily}, sans-serif`;
  const originalWidth = fragments.reduce((width, fragment) => {
    context.font = fontFor(fragment);
    return width + context.measureText(fragment.text).width;
  }, 0);
  const scale = Math.min(1, maxWidth / Math.max(1, originalWidth));
  return fragments.map((fragment) => {
    const font = fontFor(fragment, scale);
    context.font = font;
    return {
      ...fragment,
      font,
      width: context.measureText(fragment.text).width,
    };
  });
}
function drawLine(
  context: CanvasRenderingContext2D,
  fragments: MeasuredFragment[],
  x: number,
  y: number,
  color: string,
  glow: number,
  neon: boolean,
) {
  for (const fragment of fragments) {
    context.font = fragment.font;
    context.fillStyle = 'white';
    context.shadowColor = 'rgba(0,0,0,0.8)';
    context.shadowBlur = 0;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 3;
    context.fillText(fragment.text, x, y);
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.shadowColor = fragment.highlighted ? '#ffc107' : color;
    context.shadowBlur = glow * (fragment.highlighted ? 1.8 : neon ? 2.5 : 1);
    context.fillStyle = fragment.highlighted ? '#fff8e1' : neon ? color : 'white';
    context.fillText(fragment.text, x, y);
    if (neon) {
      context.shadowBlur = glow * 0.5;
      context.shadowColor = 'white';
      context.fillStyle = 'white';
      context.fillText(fragment.text, x, y);
    }
    x += fragment.width;
  }
}
export function createTextCache(
  cache: { current: TextBitmapCache },
  fontFamily: string,
  keywords: string[],
  maxWidth: number,
) {
  return function getTextBitmap({
    id,
    text,
    subText,
    thirdText,
    mainFontSize,
    subFontSize,
    glow,
    color,
    centered,
    style,
  }: TextBitmapOptions): TextBitmap {
    const tint = glow > 0 || style === 'neon' ? color : '#ffffff';
    const key = JSON.stringify([
      id,
      text,
      subText,
      thirdText,
      mainFontSize,
      subFontSize,
      glow,
      centered,
      style,
      fontFamily,
      keywords,
      maxWidth,
    ]);
    const cached = cache.current.get(key);
    if (cached) {
      if (cached.color !== tint) {
        cached.paint(tint);
        cached.color = tint;
      }
      return cached;
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    const padding = glow * 2 + 50;
    const baseline = padding + mainFontSize / 2;
    const lines = [
      {
        text,
        size: mainFontSize,
        italic: false,
        y: baseline,
      },
      {
        text: subText?.toUpperCase() || '',
        size: subFontSize,
        italic: true,
        y: baseline + mainFontSize * 1.1,
      },
      {
        text: thirdText?.toUpperCase() || '',
        size: subFontSize,
        italic: true,
        y: baseline + mainFontSize * 1.1 + subFontSize * 1.6,
      },
    ]
      .filter((line) => line.text)
      .map((line) => ({
        ...line,
        fragments: measureLine(
          context,
          line.text,
          fontFamily,
          line.size,
          line.italic,
          keywords,
          maxWidth,
        ),
      }));
    const contentWidth = Math.max(
      1,
      ...lines.map((line) => line.fragments.reduce((width, fragment) => width + fragment.width, 0)),
    );
    canvas.width = Math.ceil(contentWidth + padding * 2);
    canvas.height = Math.ceil((mainFontSize + subFontSize * 2) * 2 + padding * 2);
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    // Layout and canvas storage survive theme changes; only the visible tint is repainted.
    const paint = (paintColor: string) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const line of lines) {
        const lineWidth = line.fragments.reduce((width, fragment) => width + fragment.width, 0);
        const x = centered ? (canvas.width - lineWidth) / 2 : padding;
        drawLine(
          context,
          line.fragments,
          x,
          line.y,
          paintColor,
          line.italic ? glow * 0.8 : glow,
          style === 'neon',
        );
      }
    };
    paint(tint);
    const bitmap = {
      canvas,
      paddingX: padding,
      paddingY: baseline,
      width: canvas.width,
      paint,
      color: tint,
    };
    cache.current.set(key, bitmap);
    return bitmap;
  };
}
