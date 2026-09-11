import { drawBeatStrobe } from '../rhythm';
import { emissionCount, smoothingFactor } from '../animation';
import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
export function drawFloatingText(frame: RenderFrame, runtime: RenderRuntime) {
  const { context, stateRef, floatingTextsRef, isDraggingRef, core, particles } = runtime;
  drawBeatStrobe(context, stateRef.current, frame.themeColor, frame.width, frame.height);
  if (
    frame.showFloatingText &&
    frame.isPlaying &&
    (stateRef.current.lastFloatingSpawnTime ||
      (stateRef.current.lastFloatingSpawnTime = frame.time),
    stateRef.current.nextFloatingDelay ||
      (stateRef.current.nextFloatingDelay = 0.9 + Math.random() * 0.9),
    frame.time - stateRef.current.lastFloatingSpawnTime > stateRef.current.nextFloatingDelay &&
      floatingTextsRef.current.length < 15)
  ) {
    stateRef.current.lastFloatingSpawnTime = frame.time;
    stateRef.current.nextFloatingDelay = 0.9 + Math.random() * 0.9;
    let sourceText = frame.customFloatingText.trim();
    sourceText ||= frame.rawLyrics;
    const candidateLines = sourceText
      .split(
        `
`,
      )
      .map((line) =>
        line
          .replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, ``)
          .replace(/\|.*/, ``)
          .trim(),
      )
      .filter((line) => line.length > 0 && !line.includes(`-->`));
    if (candidateLines.length > 0) {
      const text = candidateLines[Math.floor(Math.random() * candidateLines.length)];
      const depthRatio = Math.random() ** 0.4;
      const fontSize = 20 + depthRatio * 50;
      const blurRadius = depthRatio > 0.6 ? 0 : (1 - depthRatio) * 6;
      const padding = blurRadius * 2 + 30;
      const lineHeight = fontSize * 1.15;
      const canvasWidth = fontSize * 2 + padding * 2;
      const canvasHeight = text.length * lineHeight + padding * 2;
      const canvas = document.createElement(`canvas`);
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const canvasContext = canvas.getContext(`2d`, {
        alpha: true,
      });
      if (!canvasContext) return;
      if (blurRadius > 0) {
        canvasContext.filter = `blur(${blurRadius}px)`;
      }
      canvasContext.shadowBlur = 15 + depthRatio * 15;
      canvasContext.shadowColor = frame.themeColor;
      canvasContext.font = `300 ${fontSize}px ${frame.customFont}, sans-serif`;
      canvasContext.textAlign = `center`;
      canvasContext.textBaseline = `top`;
      canvasContext.fillStyle = `#ffffff`;
      for (let index = 0; index < text.length; index++)
        canvasContext.fillText(text[index], canvasWidth / 2, padding + index * lineHeight);
      floatingTextsRef.current.push({
        text,
        x: frame.width + 50,
        y: frame.height * 0.1 + Math.random() * frame.height * 0.6,
        baseVx: -(0.2 + Math.random() * 0.8 + depthRatio * 0.5),
        size: fontSize,
        maxAlpha: 0.3 + depthRatio * 0.65,
        blur: blurRadius,
        seed: Math.random() * Math.PI * 2,
        waveSpeed: 0.008 + Math.random() * 0.02,
        waveAmp: 20 + depthRatio * 40,
        startY: frame.height * 0.1 + Math.random() * frame.height * 0.6,
        cachedCanvas: canvas,
        padX: padding,
        padY: padding,
        canvasWidth,
      });
    }
  }
  if (frame.showFloatingText) {
    context.save();
    context.globalCompositeOperation = `screen`;
    floatingTextsRef.current = floatingTextsRef.current.filter((floatingText) => {
      floatingText.x += floatingText.baseVx * frame.frameStep;
      const primaryWave = frame.time * (0.8 + floatingText.waveSpeed * 10) + floatingText.seed;
      const secondaryWave =
        frame.time * (0.5 + floatingText.waveSpeed * 8) + floatingText.seed * 1.5;
      floatingText.y =
        floatingText.startY +
        Math.sin(primaryWave) * (floatingText.waveAmp * 0.2) +
        Math.cos(secondaryWave) * (floatingText.waveAmp * 0.1);
      const travelProgress = Math.max(
        0,
        Math.min(1, (floatingText.x + floatingText.size) / (frame.width + 50 + floatingText.size)),
      );
      floatingText.alpha = Math.sin(travelProgress * Math.PI) * floatingText.maxAlpha;
      const bassScale = 1 + (frame.safeBass / 255) * 0.3;
      const opacity = Math.max(0, Math.min(1, floatingText.alpha * bassScale));
      context.save();
      context.globalAlpha = opacity;
      context.drawImage(
        floatingText.cachedCanvas,
        floatingText.x - floatingText.canvasWidth / 2,
        floatingText.y - floatingText.padY,
      );
      context.restore();
      return floatingText.x > -floatingText.canvasWidth - 20;
    });
    context.restore();
  } else {
    floatingTextsRef.current = [];
  }
  if (frame.isPlaying || isDraggingRef.current) {
    const targetX =
      core.current.baseX +
      Math.sin(frame.time * 0.7) * 110 +
      (frame.safeBass / 255) * 450 * frame.impactFactor;
    core.current.x += (targetX - core.current.x) * smoothingFactor(0.15, frame.frameStep);
    const targetY =
      frame.height / 2 +
      80 +
      Math.sin(frame.time * 1.2) * 35 -
      (frame.safeBass / 255) * 350 * frame.impactFactor;
    core.current.y += (targetY - core.current.y) * smoothingFactor(0.15, frame.frameStep);
    core.current.history = core.current.history.map((point) => ({
      ...point,
      x: point.x - (8 + (frame.safeBass / 12) * frame.impactFactor) * frame.frameStep,
      y: point.y,
    }));
    core.current.history.push({
      x: core.current.x,
      y: core.current.y,
      time: frame.time,
    });
    core.current.history = core.current.history.filter((point) => frame.time - point.time < 0.48);
    if (frame.safeBass > 180) {
      const spawnCount = emissionCount(
        Math.floor(3 + ((frame.safeBass - 180) / 10) * frame.impactFactor),
        frame.frameStep,
      );
      for (let index = 0; index < spawnCount; index++)
        particles.current.push({
          x: core.current.x,
          y: core.current.y,
          vx: -Math.random() * (15 + frame.safeBass / 8) - 6,
          vy: (Math.random() - 0.5) * (12 + frame.safeBass / 6),
          life: 1 + Math.random() * 0.5,
          color: frame.themeColor,
        });
    }
  } else {
    core.current.x +=
      (core.current.baseX - core.current.x) * smoothingFactor(0.12, frame.frameStep);
    core.current.y +=
      (frame.height / 2 + 80 - core.current.y) * smoothingFactor(0.1, frame.frameStep);
    core.current.history = core.current.history.map((point) => ({
      ...point,
      x: point.x - 8 * frame.frameStep,
      y: point.y,
    }));
    core.current.history = core.current.history.filter((point) => frame.time - point.time < 0.48);
  }
}
