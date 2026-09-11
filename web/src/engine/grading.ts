export const getColorGradeFilter = (preset: string) => {
  switch (preset) {
    case `noir`:
      return `grayscale(0.9) contrast(1.3) brightness(0.9)`;
    case `dreamy`:
      return `saturate(1.25) contrast(0.92) brightness(1.08)`;
    case `cinematic`:
      return `contrast(1.15) saturate(1.05)`;
    case `vhs`:
      return `contrast(1.2) saturate(1.3) brightness(0.95)`;
    case `cyberpunk`:
      return `contrast(1.25) saturate(1.4)`;
    default:
      return ``;
  }
};
export const colorGradePalettes: Partial<Record<string, [string, string]>> = {
  cinematic: [`#0d3b4a`, `#f2a154`],
  vhs: [`#3a0d4a`, `#0dc9c9`],
  cyberpunk: [`#7c1de0`, `#00e5ff`],
};
export const drawColorGrade = (
  context: CanvasRenderingContext2D,
  preset: string,
  width: number,
  height: number,
) => {
  const palette = colorGradePalettes[preset];
  if (!palette) {
    return;
  }
  context.save();
  context.globalCompositeOperation = `color`;
  context.globalAlpha = 0.4;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(1, palette[1]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.restore();
};
export const tintCanvas = (source: HTMLCanvasElement, color: string) => {
  const canvas = document.createElement(`canvas`);
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext(`2d`);
  if (!context) return source;
  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = `source-atop`;
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
};
export const createGlitchFrame = (
  source: CanvasImageSource,
  width: number,
  height: number,
  beat: number,
) => {
  const canvas = document.createElement(`canvas`);
  canvas.width = width;
  canvas.height = height;
  canvas.getContext(`2d`)?.drawImage(source, 0, 0, width, height);
  return {
    red: tintCanvas(canvas, `rgba(255, 40, 40, 0.9)`),
    cyan: tintCanvas(canvas, `rgba(40, 255, 255, 0.9)`),
    builtAtBeat: beat,
  };
};
export const drawBackgroundGlitch = (
  context: CanvasRenderingContext2D,
  frame: ReturnType<typeof createGlitchFrame> | null,
  pulse: number,
  intensity: number,
  width: number,
  height: number,
) => {
  if (!frame || pulse <= 0.05) {
    return;
  }
  const offset = (2 + intensity * 2) * pulse;
  context.save();
  context.globalCompositeOperation = `lighter`;
  context.globalAlpha = pulse * 0.5;
  context.drawImage(frame.red, -offset, 0, width, height);
  context.drawImage(frame.cyan, offset, 0, width, height);
  context.restore();
};
export const drawAmbilight = (
  context: CanvasRenderingContext2D,
  color: string,
  intensity: number,
  time: number,
  pulse: number,
  width: number,
  height: number,
) => {
  const opacity =
    (0.15 + (Math.sin(time * 0.6) * 0.5 + 0.5) * 0.15 + pulse * 0.35) * (intensity / 5);
  if (opacity <= 0.01) {
    return;
  }
  const edgeSize = Math.min(width, height) * 0.22;
  context.save();
  context.globalCompositeOperation = `screen`;
  context.globalAlpha = Math.max(0, Math.min(1, opacity));
  const topGradient = context.createLinearGradient(0, 0, 0, edgeSize);
  topGradient.addColorStop(0, color);
  topGradient.addColorStop(1, `rgba(0,0,0,0)`);
  context.fillStyle = topGradient;
  context.fillRect(0, 0, width, edgeSize);
  const bottomGradient = context.createLinearGradient(0, height - edgeSize, 0, height);
  bottomGradient.addColorStop(0, `rgba(0,0,0,0)`);
  bottomGradient.addColorStop(1, color);
  context.fillStyle = bottomGradient;
  context.fillRect(0, height - edgeSize, width, edgeSize);
  const leftGradient = context.createLinearGradient(0, 0, edgeSize, 0);
  leftGradient.addColorStop(0, color);
  leftGradient.addColorStop(1, `rgba(0,0,0,0)`);
  context.fillStyle = leftGradient;
  context.fillRect(0, 0, edgeSize, height);
  const rightGradient = context.createLinearGradient(width - edgeSize, 0, width, 0);
  rightGradient.addColorStop(0, `rgba(0,0,0,0)`);
  rightGradient.addColorStop(1, color);
  context.fillStyle = rightGradient;
  context.fillRect(width - edgeSize, 0, edgeSize, height);
  context.restore();
};
