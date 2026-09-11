import type { TextBitmap } from './textBitmap';
import type { Slot } from './resources';
import type { LyricParticle } from './particleTypes';
export const drawParticleLyrics = (
  context: CanvasRenderingContext2D,
  particles: Slot<Record<string, LyricParticle[]>>,
  color: string,
  id: string,
  progress: number,
  textBitmap: TextBitmap,
  x: number,
  y: number,
) => {
  if (!particles.current[id]) {
    particles.current[id] = [];
    for (let index = 0; index < 80; index++)
      particles.current[id].push({
        ox: (Math.random() - 0.5) * 800,
        oy: (Math.random() - 0.5) * 600,
        size: Math.random() * 2 + 1,
      });
  }
  const points = particles.current[id];
  const reveal = Math.min(1, progress * 4);
  context.save();
  if (reveal < 1) {
    context.globalAlpha = reveal;
    context.fillStyle = color;
    points.forEach((point) => {
      const pointX = x + point.ox * (1 - reveal);
      const pointY = y + point.oy * (1 - reveal);
      context.beginPath();
      context.arc(pointX, pointY, point.size, 0, Math.PI * 2);
      context.fill();
    });
  } else {
    context.drawImage(textBitmap.canvas, x, y);
  }
  context.restore();
};
export const drawElvenRing = (
  context: CanvasRenderingContext2D,
  color: string,
  time: number,
  energy: number,
  enabled: boolean,
  x: number,
  y: number,
  progress: number,
) => {
  if (enabled) {
    context.save();
    context.translate(x + 150, y + 30);
    context.rotate(time * 0.5);
    const energyScale = 1 + (energy / 255) * 0.5;
    context.scale(energyScale, energyScale);
    context.globalAlpha = 0.3 * Math.sin(progress * Math.PI);
    context.font = `24px "精靈文 岩ㄧㄢˊ", sans-serif`;
    context.fillStyle = color;
    context.shadowBlur = 10;
    context.shadowColor = color;
    for (let index = 0; index < 23; index++) {
      context.save();
      context.rotate(index * ((Math.PI * 2) / 23));
      context.translate(0, -150);
      context.fillText(`ㄩㄢˇㄍㄨˇㄉㄜ˙ㄕㄥㄧㄣㄗㄞˋㄏㄨㄟˊㄉㄤˋ`[index], 0, 0);
      context.restore();
    }
    context.restore();
  }
};
export const drawSpiralLyrics = (
  context: CanvasRenderingContext2D,
  progress: number,
  exiting: boolean,
  x: number,
  y: number,
  textBitmap: TextBitmap,
) => {
  context.save();
  if (exiting) {
    const exitProgress = progress * progress;
    context.transform(1, 0, exitProgress * 2, 1 + exitProgress, 0, 0);
    context.globalAlpha = 1 - exitProgress;
  } else {
    const entranceDistance = 800 * (1 - progress);
    const entranceAngle = progress * Math.PI * 4;
    context.translate(
      Math.cos(entranceAngle) * entranceDistance,
      Math.sin(entranceAngle) * entranceDistance,
    );
    context.scale(progress, progress);
  }
  context.drawImage(textBitmap.canvas, x, y);
  context.restore();
};
export const drawInkLyrics = (
  context: CanvasRenderingContext2D,
  energy: number,
  enabled: boolean,
  x: number,
  y: number,
  textBitmap: TextBitmap,
) => {
  if (enabled && energy > 150) {
    const energyRatio = (energy - 150) / 100;
    context.save();
    context.globalCompositeOperation = `screen`;
    for (let index = 0; index < 5; index++) {
      context.globalAlpha = 0.2;
      const offsetX = (Math.random() - 0.5) * energyRatio * 30;
      const offsetY = (Math.random() - 0.5) * energyRatio * 30;
      context.drawImage(textBitmap.canvas, x + offsetX, y + offsetY);
    }
    context.restore();
  } else {
    context.drawImage(textBitmap.canvas, x, y);
  }
};
export const glitchTextCache = new WeakMap<
  HTMLCanvasElement,
  { red: HTMLCanvasElement; cyan: HTMLCanvasElement }
>();
export const tintTextCanvas = (source: HTMLCanvasElement, color: string) => {
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
export const drawGlitchLyrics = (
  context: CanvasRenderingContext2D,
  textBitmap: TextBitmap,
  x: number,
  y: number,
  intensity: number,
) => {
  let tinted = glitchTextCache.get(textBitmap.canvas);
  if (!tinted) {
    tinted = {
      red: tintTextCanvas(textBitmap.canvas, `rgba(255, 60, 60, 0.9)`),
      cyan: tintTextCanvas(textBitmap.canvas, `rgba(60, 255, 255, 0.9)`),
    };
    glitchTextCache.set(textBitmap.canvas, tinted);
  }
  context.save();
  context.globalCompositeOperation = `screen`;
  context.globalAlpha = intensity * 0.8;
  context.drawImage(tinted.red, x - 6, y);
  context.drawImage(tinted.cyan, x + 6, y);
  const sliceY = Math.random() * textBitmap.canvas.height;
  const sliceHeight = 8 + Math.random() * 20;
  const offset = (Math.random() - 0.5) * 50;
  context.drawImage(
    textBitmap.canvas,
    0,
    sliceY,
    textBitmap.canvas.width,
    sliceHeight,
    x + offset,
    y + sliceY,
    textBitmap.canvas.width,
    sliceHeight,
  );
  context.restore();
};
export const drawTypewriterLyrics = (
  context: CanvasRenderingContext2D,
  textBitmap: TextBitmap,
  x: number,
  y: number,
  progress: number,
  time: number,
) => {
  const revealWidth = Math.max(0, textBitmap.width * Math.max(0, Math.min(1, progress)));
  context.save();
  context.beginPath();
  context.rect(x, y - 40, revealWidth, textBitmap.canvas.height + 80);
  context.clip();
  context.drawImage(textBitmap.canvas, x, y);
  context.restore();
  if (progress < 0.98 && Math.sin(time * 8) > 0) {
    context.save();
    context.fillStyle = `rgba(255,255,255,0.85)`;
    context.fillRect(
      x + revealWidth,
      y - textBitmap.canvas.height * 0.3,
      3,
      textBitmap.canvas.height * 0.6,
    );
    context.restore();
  }
};
export const drawFlipLyrics = (
  context: CanvasRenderingContext2D,
  textBitmap: TextBitmap,
  x: number,
  y: number,
  progress: number,
  strips: number,
) => {
  const canvas = textBitmap.canvas;
  const stripCount = Math.max(4, Math.min(40, strips));
  const stripWidth = canvas.width / stripCount;
  for (let index = 0; index < stripCount; index++) {
    const stripProgress = Math.max(
      0,
      Math.min(1, (progress - index / stripCount) * stripCount * 0.8),
    );
    const verticalScale = Math.abs(Math.cos(stripProgress * Math.PI));
    const sourceX = index * stripWidth;
    const centerX = x + sourceX + stripWidth / 2;
    const centerY = y + canvas.height / 2;
    context.save();
    context.translate(centerX, centerY);
    context.scale(1, Math.max(0.02, verticalScale));
    context.globalAlpha = 0.4 + 0.6 * stripProgress;
    context.drawImage(
      canvas,
      sourceX,
      0,
      stripWidth,
      canvas.height,
      -stripWidth / 2,
      -canvas.height / 2,
      stripWidth,
      canvas.height,
    );
    context.restore();
  }
};
export const drawKaraokeBall = (
  context: CanvasRenderingContext2D,
  textBitmap: TextBitmap,
  x: number,
  y: number,
  progress: number,
  color: string,
) => {
  const ratio = Math.max(0, Math.min(1, progress));
  const ballX = x + textBitmap.width * ratio;
  const bounceCount = Math.max(4, Math.round(textBitmap.width / 30));
  const bounceY = -Math.abs(Math.sin(ratio * Math.PI * bounceCount)) * 22;
  const ballY = y - 24 + bounceY;
  context.save();
  context.fillStyle = color;
  context.shadowBlur = 12;
  context.shadowColor = color;
  context.beginPath();
  context.arc(ballX, ballY, 8, 0, Math.PI * 2);
  context.fill();
  context.restore();
};
