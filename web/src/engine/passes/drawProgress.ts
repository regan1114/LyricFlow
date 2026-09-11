import { formatPlaybackTime } from '../time';
import { emissionCount } from '../animation';
import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
export function drawProgress(frame: RenderFrame, runtime: RenderRuntime) {
  const { audioRef, progressBarRef, isDraggingRef, context, progressParticles } = runtime;
  const audioDuration = runtime.stateRef.current.timelineDuration ?? audioRef.current?.duration;
  const duration = !audioDuration || isNaN(audioDuration) ? 0 : audioDuration;
  if (progressBarRef.current && !isDraggingRef.current && duration > 0) {
    progressBarRef.current.value = String(frame.currentTime);
  }
  let progress = duration > 0 ? frame.currentTime / duration : 0;
  progress = isNaN(progress) ? 0 : Math.max(0, Math.min(1, progress));
  const progressX = progress * frame.width;
  const progressY = frame.height - 15;
  context.save();
  context.beginPath();
  context.moveTo(progressX, progressY);
  context.lineTo(frame.width, progressY);
  context.strokeStyle = `rgba(255, 255, 255, 0.1)`;
  context.lineWidth = 2;
  context.stroke();
  if (progressX > 0) {
    const gradientEndX = Math.max(0.1, progressX);
    const gradient = context.createLinearGradient(0, 0, gradientEndX, 0);
    gradient.addColorStop(0, `rgba(255,255,255,0.1)`);
    gradient.addColorStop(1, frame.themeColor);
    context.beginPath();
    context.moveTo(0, progressY);
    context.lineTo(progressX, progressY);
    context.strokeStyle = gradient;
    context.lineWidth = Math.max(0.1, 4 + (frame.safeBass / 255) * 4);
    context.shadowBlur = 15;
    context.shadowColor = frame.themeColor;
    context.lineCap = `round`;
    context.stroke();
  }
  const progressRadius = Math.max(0.1, 6 + (frame.safeBass / 255) * 6);
  context.beginPath();
  context.arc(progressX, progressY, progressRadius, 0, Math.PI * 2);
  context.fillStyle = `#fff`;
  context.shadowBlur = 20;
  context.shadowColor = frame.themeColor;
  context.fill();
  context.font = `800 16px ${frame.customFont}, sans-serif`;
  context.fillStyle = `rgba(255,255,255,0.9)`;
  context.textAlign = `center`;
  context.shadowBlur = 10;
  context.shadowColor = `black`;
  const timeLabel = formatPlaybackTime(frame.currentTime);
  const timeLabelX = Math.max(40, Math.min(progressX, frame.width - 40));
  context.fillText(timeLabel, timeLabelX, progressY - 20);
  for (
    let remaining =
      (frame.isPlaying || isDraggingRef.current) && progress > 0
        ? emissionCount(0.6, frame.frameStep)
        : 0;
    remaining > 0;
    remaining--
  ) {
    progressParticles.current.push({
      x: progressX,
      y: progressY,
      vx: (Math.random() - 0.5) * 4 - 2,
      vy: -Math.random() * 4 - 1,
      life: 1,
      color: Math.random() > 0.5 ? `#fff` : frame.themeColor,
      size: Math.random() * 3 + 1,
    });
  }
  context.globalCompositeOperation = `lighter`;
  progressParticles.current = progressParticles.current.filter((particle) => {
    particle.x += (isNaN(particle.vx) ? 0 : particle.vx) * frame.frameStep;
    particle.y += (isNaN(particle.vy) ? 0 : particle.vy) * frame.frameStep;
    particle.life -= 0.02 * frame.frameStep;
    context.globalAlpha = Math.max(0, Math.min(1, particle.life));
    context.fillStyle = particle.color;
    context.beginPath();
    const particleRadius = Math.max(0.01, particle.size * particle.life);
    context.arc(particle.x, particle.y, particleRadius, 0, Math.PI * 2);
    context.fill();
    return particle.life > 0;
  });
  context.restore();
}
