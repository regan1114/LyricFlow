import { withAlpha } from '../colors';
import { emissionCount, smoothingFactor } from '../animation';
import {
  phoneticCharacters,
  spawnFirefly,
  drawFireflies,
  spawnSnowflake,
  drawSnow,
  spawnFireworks,
  drawFireworks,
} from '../particles';
import { drawCircularSpectrum, drawSignalWaveform } from '../spectrum';
import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
export function drawAtmosphere(frame: RenderFrame, runtime: RenderRuntime) {
  const {
    stateRef,
    context,
    rainParticlesRef,
    dustParticles,
    analyserRef,
    zhuyinParticles,
    firefliesRef,
    snowParticlesRef,
    fireworksParticlesRef,
    smoothVignetteAlpha,
    smoothVignetteRadius,
    depthElements,
  } = runtime;
  const targetSceneScale =
    (1 + (frame.safeBass * frame.impactFactor) / 6500) * stateRef.current.screenShakeScale;
  const sceneScale = isNaN(targetSceneScale) ? 1 : Math.max(0.001, targetSceneScale);
  context.setTransform(
    sceneScale,
    0,
    0,
    sceneScale,
    (frame.width * (1 - sceneScale)) / 2 + stateRef.current.screenShakeX,
    (frame.height * (1 - sceneScale)) / 2 + stateRef.current.screenShakeY,
  );
  context.fillStyle = `rgba(0, 0, 0, 0.12)`;
  context.fillRect(-200, -200, frame.width + 400, frame.height + 400);
  for (
    let remaining = frame.showRain && frame.isPlaying ? emissionCount(0.8, frame.frameStep) : 0;
    remaining > 0;
    remaining--
  ) {
    for (let index = 0; index < 3; index++)
      rainParticlesRef.current.push({
        x: Math.random() * frame.width,
        y: -50,
        vx: -1 + Math.random() * 0.5,
        vy: 20 + Math.random() * 15,
        length: 20 + Math.random() * 30,
        alpha: 0.2 + Math.random() * 0.3,
      });
  }
  rainParticlesRef.current = rainParticlesRef.current.filter((particle) => {
    particle.x += particle.vx * frame.frameStep;
    particle.y += particle.vy * frame.frameStep;
    context.save();
    context.globalAlpha = particle.alpha;
    context.beginPath();
    context.moveTo(particle.x, particle.y);
    context.lineTo(particle.x - particle.vx * 1.5, particle.y - particle.length);
    context.strokeStyle = `rgba(200, 220, 255, 0.8)`;
    context.lineWidth = 1.5;
    context.lineCap = `round`;
    context.stroke();
    context.restore();
    return particle.y < frame.height + 100;
  });
  if (frame.showNostalgic) {
    context.save();
    context.fillStyle = `rgba(150, 70, 0, 0.12)`;
    context.fillRect(0, 0, frame.width, frame.height);
    if (frame.isPlaying && Math.random() > 0.85 - (frame.safeBass / 255) * 0.2) {
      context.fillStyle = `rgba(255, 240, 220, ${Math.random() * 0.08})`;
      context.fillRect(Math.random() * frame.width, 0, Math.random() * 2 + 0.5, frame.height);
    }
    if (frame.isPlaying && Math.random() > 0.9) {
      context.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.06})`;
      context.fillRect(Math.random() * frame.width, 0, Math.random() * 4, frame.height);
    }
    if (frame.isPlaying) {
      const dustSpawnCount = emissionCount(
        Math.floor(1 + (frame.safeBass / 60) * frame.impactFactor),
        frame.frameStep,
      );
      for (let index = 0; index < dustSpawnCount; index++) {
        if (Math.random() > 0.3) {
          dustParticles.current.push({
            x: Math.random() * frame.width,
            y: frame.height + 20,
            vx: (Math.random() - 0.5) * 1.5,
            vy: -(Math.random() * 1.5 + 0.5 + frame.safeBass / 100),
            size: Math.random() * 2.5 + 0.5,
            alpha: Math.random() * 0.6 + 0.2,
            flickerSpeed: Math.random() * 0.1 + 0.05,
          });
        }
      }
    }
    context.globalCompositeOperation = `lighter`;
    dustParticles.current = dustParticles.current.filter((particle) => {
      particle.x += (particle.vx + Math.sin(frame.time * 2) * 0.5) * frame.frameStep;
      particle.y += particle.vy * frame.frameStep;
      particle.alpha += Math.sin(frame.time * 10 * particle.flickerSpeed) * 0.05 * frame.frameStep;
      context.globalAlpha = Math.max(0, Math.min(1, particle.alpha));
      context.fillStyle = `#fbbf24`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
      return particle.y > -20 && particle.alpha > 0;
    });
    context.globalCompositeOperation = `source-over`;
    context.restore();
  }
  if (analyserRef.current) {
    let midFrequencyTotal = 0;
    for (let index = 20; index < 50; index++) midFrequencyTotal += frame.frequencyData[index];
    const midFrequencyAverage = midFrequencyTotal / 30;
    if (
      frame.showElvenParticles &&
      frame.isPlaying &&
      (isNaN(midFrequencyAverage) ? 0 : midFrequencyAverage) > 130 &&
      emissionCount(0.04, frame.frameStep) > 0 &&
      frame.time - stateRef.current.lastElvenSpawnTime > 0.6
    ) {
      stateRef.current.lastElvenSpawnTime = frame.time;
      let phoneticText = ``;
      const characterCount = Math.floor(Math.random() * 3) + 1;
      for (let index = 0; index < characterCount; index++)
        phoneticText += phoneticCharacters[Math.floor(Math.random() * phoneticCharacters.length)];
      zhuyinParticles.current.push({
        text: phoneticText,
        x: frame.width / 2 + (Math.random() - 0.5) * 800,
        y: frame.height - 150 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -Math.random() * 1.2 - 0.3,
        life: 1.5,
        scale: Math.max(0.1, Math.random() * 0.5 + 0.6),
      });
    }
  }
  for (
    let remaining =
      frame.showFireflies && frame.isPlaying ? emissionCount(0.15, frame.frameStep) : 0;
    remaining > 0 && firefliesRef.current.length < 60;
    remaining--
  ) {
    spawnFirefly(firefliesRef.current, frame.width, frame.height);
  }
  firefliesRef.current = drawFireflies(
    context,
    firefliesRef.current,
    frame.time,
    frame.width,
    frame.height,
    frame.frameStep,
  );
  for (
    let remaining = frame.showSnow && frame.isPlaying ? emissionCount(0.5, frame.frameStep) : 0;
    remaining > 0 && snowParticlesRef.current.length < 200;
    remaining--
  ) {
    spawnSnowflake(snowParticlesRef.current, frame.width);
  }
  snowParticlesRef.current = drawSnow(
    context,
    snowParticlesRef.current,
    frame.time,
    frame.height,
    frame.frameStep,
  );
  if (
    frame.showFireworks &&
    frame.isPlaying &&
    stateRef.current.beatJustFired &&
    frame.safeBass > 190 &&
    fireworksParticlesRef.current.length < 400
  ) {
    spawnFireworks(
      fireworksParticlesRef.current,
      frame.width * (0.2 + Math.random() * 0.6),
      frame.height * (0.15 + Math.random() * 0.35),
    );
  }
  fireworksParticlesRef.current = drawFireworks(
    context,
    fireworksParticlesRef.current,
    frame.frameStep,
  );
  if (frame.showWaveform && stateRef.current.waveformStyle !== 'none') {
    context.save();
    context.translate(frame.smoothMouseX * 0.6, frame.smoothMouseY * 0.6);
    const visualScale = Math.max(0.15, Math.min(1, frame.visualSize / 100));
    const visualCenterY = frame.height * (frame.visualY / 100);
    if (stateRef.current.waveformStyle === `bar`) {
      if (analyserRef.current) {
        const frequencyData = frame.frequencyData.slice(0, 160);
        const spectrumWidth = frame.width * visualScale;
        const barSlotWidth = spectrumWidth / 120;
        const barGap = Math.max(1, barSlotWidth * 0.25);
        const spectrumLeft = (frame.width - spectrumWidth) / 2;
        const spectrumBaseline = visualCenterY;
        context.fillStyle = frame.themeColor;
        context.shadowBlur = 15;
        context.shadowColor = frame.themeColor;
        for (let index = 0; index < 120; index++) {
          const frequencyRatio = (index / 120) ** 2;
          const frequencyIndex = Math.floor(frequencyRatio * frequencyData.length);
          let amplitude = frequencyData[frequencyIndex];
          if (frequencyIndex > 0 && frequencyIndex < frequencyData.length - 1) {
            amplitude =
              (frequencyData[frequencyIndex - 1] + amplitude + frequencyData[frequencyIndex + 1]) /
              3;
          }
          const barHeight = Math.max(4, (amplitude / 255) * 280 * visualScale);
          context.beginPath();
          context.lineCap = `round`;
          context.lineWidth = barSlotWidth - barGap;
          const gradient = context.createLinearGradient(
            0,
            spectrumBaseline,
            0,
            spectrumBaseline - barHeight,
          );
          gradient.addColorStop(0, withAlpha(frame.themeColor, 0.3));
          gradient.addColorStop(0.5, withAlpha(frame.themeColor, 0.8));
          gradient.addColorStop(1, `#ffffff`);
          context.strokeStyle = gradient;
          context.shadowBlur = (amplitude / 255) * 20;
          const barX = spectrumLeft + index * barSlotWidth + (barSlotWidth - barGap) / 2;
          context.moveTo(barX, spectrumBaseline);
          context.lineTo(barX, spectrumBaseline - barHeight);
          context.stroke();
          context.globalAlpha = 0.2;
          context.shadowBlur = 0;
          context.beginPath();
          context.strokeStyle = frame.themeColor;
          context.moveTo(barX, spectrumBaseline + 4);
          context.lineTo(barX, spectrumBaseline + 4 + barHeight * 0.25);
          context.stroke();
          context.globalAlpha = 1;
        }
      }
    } else if (stateRef.current.waveformStyle === `radial`) {
      if (analyserRef.current) {
        drawCircularSpectrum({
          ctx: context,
          dataArray: frame.frequencyData,
          cx: frame.width / 2,
          cy: visualCenterY,
          baseRadius: 200 * visualScale,
          themeColor: frame.themeColor,
          time: frame.time,
        });
      }
    } else {
      if (analyserRef.current) {
        drawSignalWaveform({
          context,
          waveformData: frame.waveformData,
          centerY: visualCenterY,
          width: frame.width,
          height: frame.height,
          size: visualScale,
          themeColor: frame.themeColor,
        });
      }
    }
    context.restore();
  }
  if (frame.showVignette) {
    context.save();
    const targetVignetteAlpha = (frame.safeBass / 255) * 0.45 * frame.impactFactor;
    const targetVignetteRadius = 1 - (frame.safeBass / 255) * 0.2 * frame.impactFactor;
    smoothVignetteAlpha.current +=
      (targetVignetteAlpha - smoothVignetteAlpha.current) * smoothingFactor(0.03, frame.frameStep);
    smoothVignetteRadius.current +=
      (targetVignetteRadius - smoothVignetteRadius.current) *
      smoothingFactor(0.03, frame.frameStep);
    const vignetteRadius = Math.max(0.01, smoothVignetteRadius.current);
    const vignetteAlpha = Math.max(0, Math.min(1, 0.45 + smoothVignetteAlpha.current));
    const gradient = context.createRadialGradient(
      frame.width / 2,
      frame.height / 2,
      Math.max(0.1, (frame.width / 3.2) * vignetteRadius),
      frame.width / 2,
      frame.height / 2,
      Math.max(1, frame.width * 0.95),
    );
    gradient.addColorStop(0, `rgba(0, 0, 0, 0)`);
    if (frame.showNostalgic) {
      gradient.addColorStop(1, `rgba(40, 20, 5, ${vignetteAlpha + 0.2})`);
    } else {
      gradient.addColorStop(1, `rgba(0, 0, 0, ${vignetteAlpha})`);
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, frame.width, frame.height);
    context.restore();
  }
  if (frame.showBokeh) {
    context.save();
    context.translate(frame.smoothMouseX * 1.5, frame.smoothMouseY * 1.5);
    for (let remaining = emissionCount(0.063, frame.frameStep); remaining > 0; remaining--) {
      const depth = Math.random();
      depthElements.current.push({
        x: frame.width + 500,
        y: Math.random() * frame.height,
        z: depth,
        size:
          depth > 0.8
            ? 280 + Math.random() * 250
            : depth < 0.2
              ? 5 + Math.random() * 5
              : 60 + Math.random() * 100,
        speed: 1.2 + depth * 1.8 + frame.safeBass / 200,
        floatAmp: 0.5 + depth * 1.5,
        floatFreq: 0.3 + Math.random() * 0.5,
        alpha: 0,
        maxAlpha: depth > 0.8 ? 0.07 : depth < 0.2 ? 0.95 : 0.4,
        seed: Math.random() * Math.PI * 2,
      });
    }
    context.globalCompositeOperation = `lighter`;
    depthElements.current = depthElements.current.filter((element) => {
      element.x -= (isNaN(element.speed) ? 0 : element.speed) * frame.frameStep;
      element.y += isNaN(element.floatAmp)
        ? 0
        : Math.sin(frame.time * element.floatFreq + element.seed) *
          element.floatAmp *
          frame.frameStep;
      element.alpha = Math.max(
        0,
        Math.min(element.maxAlpha, element.alpha + 0.005 * frame.frameStep),
      );
      const opacity = Math.max(
        0,
        Math.min(1, element.alpha * (0.7 + 0.3 * Math.sin(frame.time * 2 + element.seed))),
      );
      context.save();
      context.globalAlpha = opacity;
      const radius = Math.max(0.1, element.size * (1 + frame.safeBass / 2500));
      const gradient = context.createRadialGradient(
        element.x,
        element.y,
        0,
        element.x,
        element.y,
        radius,
      );
      if (element.z < 0.2) {
        gradient.addColorStop(0, `#ffffff`);
        gradient.addColorStop(0.5, `rgba(255, 255, 255, 0.4)`);
        gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
      } else {
        gradient.addColorStop(0, frame.themeColor);
        gradient.addColorStop(0.3, withAlpha(frame.themeColor, 0.25));
        gradient.addColorStop(1, `rgba(0, 0, 0, 0)`);
      }
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(element.x, element.y, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return element.x > -600;
    });
    context.globalCompositeOperation = `source-over`;
    context.restore();
  } else {
    depthElements.current = [];
  }
}
