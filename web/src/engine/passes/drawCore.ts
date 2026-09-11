import { withAlpha } from '../colors';
import { drawVinyl } from '../spectrum';
import { smoothingFactor } from '../animation';
import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
export function drawCore(frame: RenderFrame, runtime: RenderRuntime) {
  const { particles, context, core, stateRef, coreImageRef, coreMediaCacheRef, coreVideoRef } =
    runtime;
  particles.current = particles.current.filter((particle) => {
    particle.x += (isNaN(particle.vx) ? 0 : particle.vx) * frame.frameStep;
    particle.y += (isNaN(particle.vy) ? 0 : particle.vy) * frame.frameStep;
    particle.life -= 0.035 * frame.frameStep;
    if (frame.visualMode !== `none`) {
      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, particle.life));
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, 2.5, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    return particle.life > 0;
  });
  if (frame.visualMode !== `none`) {
    context.save();
    context.globalCompositeOperation = `lighter`;
    context.lineCap = `round`;
    const history = core.current.history;
    if (history.length > 2) {
      for (let index = 0; index < history.length - 1; index++) {
        const fromPoint = history[index];
        const toPoint = history[index + 1];
        const ratio = index / (history.length - 1);
        context.beginPath();
        context.strokeStyle = withAlpha(
          frame.themeColor,
          Math.max(0, Math.min(1, ratio ** 4 * 0.45)),
        );
        context.lineWidth = Math.max(
          0.1,
          36 * ratio * (1 + (frame.safeBass * frame.impactFactor) / 800),
        );
        context.moveTo(fromPoint.x, fromPoint.y);
        context.lineTo(toPoint.x, toPoint.y);
        context.stroke();
      }
      for (let index = 0; index < history.length - 1; index++) {
        const fromPoint = history[index];
        const toPoint = history[index + 1];
        const ratio = index / (history.length - 1);
        context.beginPath();
        context.strokeStyle = withAlpha(`#ffffff`, Math.max(0, Math.min(1, ratio ** 5 * 0.7)));
        context.lineWidth = Math.max(0.1, 5 * ratio);
        context.moveTo(fromPoint.x, fromPoint.y);
        context.lineTo(toPoint.x, toPoint.y);
        context.stroke();
      }
    }
    context.restore();
  }
  if (frame.visualMode !== `none`) {
    context.save();
    const bassPeak = (frame.safeBass / 255) ** 4;
    let mediaSource = null;
    let mediaWidth = 0;
    let mediaHeight = 0;
    if (frame.visualMode === `orb` || frame.visualMode === `vinyl`) {
      const coreMediaType = stateRef.current.coreMediaType;
      const bounceScale = 1 + bassPeak * frame.impactFactor * 0.4;
      const targetWidth = 80 * (stateRef.current.coreMediaScale / 100) * bounceScale;
      if (coreMediaType === `image` && coreImageRef.current && coreImageRef.current.complete) {
        const coreImage = coreImageRef.current;
        if (coreImage.width > 0 && coreImage.height > 0) {
          const displayScale = targetWidth / coreImage.width;
          mediaWidth = coreImage.width * displayScale;
          mediaHeight = coreImage.height * displayScale;
          if (!coreMediaCacheRef.current || coreMediaCacheRef.current.src !== coreImage.src) {
            const canvas = document.createElement(`canvas`);
            const cacheScale = 800 / Math.max(coreImage.width, coreImage.height);
            const cacheWidth = coreImage.width * cacheScale;
            const cacheHeight = coreImage.height * cacheScale;
            canvas.width = cacheWidth;
            canvas.height = cacheHeight;
            canvas.getContext(`2d`)?.drawImage(coreImage, 0, 0, cacheWidth, cacheHeight);
            coreMediaCacheRef.current = {
              canvas: canvas,
              src: coreImage.src,
              type: `image`,
            };
          }
          if (coreMediaCacheRef.current && coreMediaCacheRef.current.canvas.width > 0) {
            mediaSource = coreMediaCacheRef.current.canvas;
          }
        }
      } else if (coreMediaType === `video` && coreVideoRef.current) {
        const video = coreVideoRef.current;
        let videoWidth = video.videoWidth;
        let videoHeight = video.videoHeight;
        if (
          videoWidth === 0 &&
          coreMediaCacheRef.current &&
          coreMediaCacheRef.current.type === `video`
        ) {
          videoWidth = coreMediaCacheRef.current.canvas.width;
          videoHeight = coreMediaCacheRef.current.canvas.height;
        }
        if (videoWidth > 0 && videoHeight > 0) {
          if (
            !coreMediaCacheRef.current ||
            coreMediaCacheRef.current.type !== `video` ||
            coreMediaCacheRef.current.src !== video.src
          ) {
            const videoCanvas = document.createElement(`canvas`);
            videoCanvas.width = videoWidth;
            videoCanvas.height = videoHeight;
            coreMediaCacheRef.current = {
              canvas: videoCanvas,
              src: video.src,
              type: `video`,
            };
          }
          const canvas = coreMediaCacheRef.current.canvas;
          const canvasContext = canvas.getContext(`2d`, {
            willReadFrequently: true,
          });
          let canDrawVideoFrame = false;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            canDrawVideoFrame = true;
            if (
              video.duration > 0 &&
              (video.duration - video.currentTime < 0.15 || video.currentTime < 0.15) &&
              canvas.width > 0
            ) {
              canDrawVideoFrame = false;
            }
          }
          if (canDrawVideoFrame) {
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
            canvasContext?.clearRect(0, 0, canvas.width, canvas.height);
            canvasContext?.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
          if (canvas.width > 0) {
            mediaSource = canvas;
            const displayScale = targetWidth / canvas.width;
            mediaWidth = canvas.width * displayScale;
            mediaHeight = canvas.height * displayScale;
          }
        }
      }
    }
    if (frame.visualMode === `orb`) {
      if (mediaSource && mediaWidth > 0 && mediaHeight > 0) {
        context.save();
        context.translate(core.current.x, core.current.y);
        context.shadowBlur = 40 * (1 + bassPeak * frame.impactFactor * 0.4);
        context.shadowColor = frame.themeColor;
        context.drawImage(mediaSource, -mediaWidth / 2, -mediaHeight / 2, mediaWidth, mediaHeight);
        context.restore();
      } else {
        const targetRadius = 28 + bassPeak * 180 * frame.impactFactor;
        const safeRadius = isNaN(targetRadius) ? 28 : Math.max(0.1, targetRadius);
        let smoothRadius = isNaN(stateRef.current.orbRadius) ? 28 : stateRef.current.orbRadius;
        smoothRadius +=
          safeRadius > smoothRadius
            ? (safeRadius - smoothRadius) * smoothingFactor(0.8, frame.frameStep)
            : (safeRadius - smoothRadius) * smoothingFactor(0.15, frame.frameStep);
        stateRef.current.orbRadius = smoothRadius;
        const glowRadius = Math.max(0.1, Math.max(0.1, smoothRadius) * 3.2);
        const coreRadius = Math.max(0.1, 10 + bassPeak * 40 * frame.impactFactor);
        const gradient = context.createRadialGradient(
          core.current.x,
          core.current.y,
          0,
          core.current.x,
          core.current.y,
          glowRadius,
        );
        gradient.addColorStop(0, withAlpha(frame.themeColor, 0.9));
        gradient.addColorStop(0.3, withAlpha(frame.themeColor, 0.3));
        gradient.addColorStop(1, `rgba(0,0,0,0)`);
        context.beginPath();
        context.arc(core.current.x, core.current.y, glowRadius, 0, Math.PI * 2);
        context.fillStyle = gradient;
        context.fill();
        context.beginPath();
        context.arc(core.current.x, core.current.y, coreRadius, 0, Math.PI * 2);
        context.fillStyle = `white`;
        context.fill();
      }
    } else if (frame.visualMode === `fluid`) {
      const baseRadius = Math.max(0.1, 40 + frame.safeBass * frame.impactFactor * 1.5);
      for (let index = 0; index < 3; index++) {
        context.beginPath();
        for (let pointIndex = 0; pointIndex <= 120; pointIndex++) {
          const angle = (pointIndex / 120) * Math.PI * 2;
          const phaseOffset = (index * Math.PI) / 3;
          const radialWave =
            Math.sin(angle * (4 + index) + frame.time * (2 + index * 0.5) + phaseOffset) *
            (15 + frame.safeBass / 10);
          const secondaryWave =
            Math.cos(angle * (3 - index) - frame.time * 1.2 + phaseOffset) *
            (10 + frame.safeMid / 15);
          const radius = Math.max(0.1, baseRadius + radialWave + secondaryWave);
          const pointX = core.current.x + Math.cos(angle) * radius;
          const pointY = core.current.y + Math.sin(angle) * radius;
          if (pointIndex === 0) {
            context.moveTo(pointX, pointY);
          } else {
            context.lineTo(pointX, pointY);
          }
        }
        context.closePath();
        context.fillStyle = withAlpha(frame.themeColor, Math.max(0, 0.15 - index * 0.05));
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = withAlpha(
          index === 0 ? `#ffffff` : frame.themeColor,
          Math.max(0, 0.6 - index * 0.2),
        );
        context.stroke();
      }
      context.beginPath();
      context.arc(
        core.current.x,
        core.current.y,
        Math.max(0.1, 10 + frame.safeBass / 20),
        0,
        Math.PI * 2,
      );
      context.fillStyle = `#ffffff`;
      context.shadowBlur = 20;
      context.shadowColor = frame.themeColor;
      context.fill();
    } else {
      if (frame.visualMode === `vinyl`) {
        drawVinyl({
          ctx: context,
          state: stateRef.current,
          x: core.current.x,
          y: core.current.y,
          engine: frame.isPlaying,
          dtPerf: Math.min(0.1, frame.deltaSeconds || 0.016),
          bassPeak: bassPeak,
          safeMid: frame.safeMid,
          bassImpactFactor: frame.impactFactor,
          themeColor: frame.themeColor,
          labelSource: mediaSource,
          coreMediaScale: stateRef.current.coreMediaScale,
          beatPulse: frame.beatPulse,
        });
      }
    }
    context.restore();
  }
}
