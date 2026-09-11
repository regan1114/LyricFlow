import { withAlpha } from './colors';
import type { RenderState } from './resources';
interface VinylOptions {
  ctx: CanvasRenderingContext2D;
  state: RenderState;
  x: number;
  y: number;
  engine: boolean;
  dtPerf: number;
  bassPeak: number;
  safeMid: number;
  bassImpactFactor: number;
  themeColor: string;
  labelSource: CanvasImageSource | null;
  coreMediaScale: number;
  beatPulse: number;
}
interface CircularSpectrumOptions {
  ctx: CanvasRenderingContext2D;
  dataArray: Uint8Array;
  cx: number;
  cy: number;
  baseRadius: number;
  themeColor: string;
  time: number;
}
interface SignalWaveformOptions {
  context: CanvasRenderingContext2D;
  waveformData: Uint8Array;
  centerY: number;
  width: number;
  height: number;
  size: number;
  themeColor: string;
}
export const drawVinyl = ({
  ctx,
  state,
  x: centerX,
  y: centerY,
  engine,
  dtPerf,
  bassPeak,
  safeMid,
  bassImpactFactor,
  themeColor,
  labelSource,
  coreMediaScale,
  beatPulse,
}: VinylOptions) => {
  const targetSpeed = engine ? 2.2 : 0;
  const smoothing = engine ? 0.9 : 0.6;
  state.vinylAngularVelocity +=
    (targetSpeed - state.vinylAngularVelocity) * Math.min(1, smoothing * dtPerf * 4);
  state.vinylAngle += state.vinylAngularVelocity * dtPerf;
  const bounceScale = 1 + bassPeak * bassImpactFactor * 0.15;
  const radius = Math.max(1, (coreMediaScale / 100) * 95 * bounceScale);
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.save();
  ctx.rotate(state.vinylAngle);
  ctx.shadowBlur = 30 * bounceScale;
  ctx.shadowColor = themeColor;
  const discGradient = ctx.createRadialGradient(0, 0, radius * 0.35, 0, 0, radius);
  discGradient.addColorStop(0, `#1a1a1a`);
  discGradient.addColorStop(1, `#050505`);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = discGradient;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255,255,255,0.06)`;
  ctx.lineWidth = 1;
  for (let index = radius * 0.45; index < radius * 0.95; index += radius * 0.08) {
    ctx.beginPath();
    ctx.arc(0, 0, index, 0, Math.PI * 2);
    ctx.stroke();
  }
  const labelRadius = radius * 0.4;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, labelRadius, 0, Math.PI * 2);
  ctx.clip();
  if (labelSource) {
    ctx.drawImage(labelSource, -labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2);
  } else {
    const gradient = ctx.createLinearGradient(-labelRadius, -labelRadius, labelRadius, labelRadius);
    gradient.addColorStop(0, withAlpha(themeColor, 0.9));
    gradient.addColorStop(1, withAlpha(themeColor, 0.4));
    ctx.fillStyle = gradient;
    ctx.fillRect(-labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2);
  }
  ctx.restore();
  ctx.strokeStyle = `rgba(255,255,255,0.25)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, labelRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.035, 0, Math.PI * 2);
  ctx.fillStyle = `#000`;
  ctx.fill();
  ctx.restore();
  const armX = radius * 1.35;
  const armY = -radius * 1.25;
  const beatShake = beatPulse > 0.3 ? (Math.random() - 0.5) * beatPulse * 0.05 : 0;
  const armAngle = -0.55 + (safeMid / 255) * 0.12 + beatShake;
  const armLength = radius * 1.35;
  ctx.save();
  ctx.translate(armX, armY);
  ctx.rotate(armAngle);
  ctx.strokeStyle = `rgba(220,220,220,0.85)`;
  ctx.lineWidth = Math.max(1, radius * 0.03);
  ctx.lineCap = `round`;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-armLength, armLength * 0.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.fillStyle = `#ddd`;
  ctx.arc(0, 0, radius * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = `#eee`;
  ctx.arc(-armLength, armLength * 0.55, radius * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
};
export const drawCircularSpectrum = ({
  ctx,
  dataArray,
  cx,
  cy,
  baseRadius,
  themeColor,
  time,
}: CircularSpectrumOptions) => {
  const bandCount = Math.min(dataArray.length, 160);
  const rotation = time * 0.06;
  ctx.save();
  ctx.translate(cx, cy);
  for (let index = 0; index < 96; index++) {
    const angle = (index / 96) * Math.PI * 2 + rotation;
    const bandRatio = (index / 96) ** 1.5;
    const amplitude = dataArray[Math.min(bandCount - 1, Math.floor(bandRatio * bandCount))] || 0;
    const barLength = Math.max(3, (amplitude / 255) * 150);
    const verticalRatio = (Math.sin(angle) + 1) / 2;
    const opacity = 0.3 + verticalRatio * 0.65;
    const perspectiveScale = 0.55 + verticalRatio * 0.55;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const startX = cosine * baseRadius;
    const startY = sine * baseRadius;
    const endX = cosine * (baseRadius + barLength * perspectiveScale);
    const endY = sine * (baseRadius + barLength * perspectiveScale);
    ctx.beginPath();
    ctx.strokeStyle = withAlpha(themeColor, opacity);
    ctx.lineWidth = Math.max(1, 3 * perspectiveScale);
    ctx.lineCap = `round`;
    ctx.shadowBlur = 12 * verticalRatio;
    ctx.shadowColor = themeColor;
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
  ctx.restore();
};

export function drawSignalWaveform({
  context,
  waveformData,
  centerY,
  width,
  height,
  size,
  themeColor,
}: SignalWaveformOptions) {
  const sampleCount = Math.min(512, waveformData.length);
  const visualWidth = width * (0.35 + size * 0.5);
  const left = (width - visualWidth) / 2;
  context.save();
  context.strokeStyle = themeColor;
  context.lineWidth = Math.max(2, Math.min(width, height) / 360);
  context.lineJoin = `round`;
  context.shadowColor = withAlpha(themeColor, 0.65);
  context.shadowBlur = Math.min(width, height) / 40;
  for (let layer = 2; layer >= 0; layer--) {
    context.beginPath();
    context.globalAlpha = layer === 0 ? 1 : 0.17;
    for (let index = 0; index < sampleCount; index++) {
      const sample = ((waveformData[index] || 128) - 128) / 128;
      const windowRatio = Math.sin((index / (sampleCount - 1)) * Math.PI);
      const pointX = left + (index / (sampleCount - 1)) * visualWidth;
      const pointY = centerY + sample * height * 0.25 * size * windowRatio + layer * (height / 100);
      if (index === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.stroke();
  }
  context.restore();
}
