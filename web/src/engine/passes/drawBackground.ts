import { sampleImageColor } from '../colors';
import {
  getColorGradeFilter,
  drawColorGrade,
  createGlitchFrame,
  drawBackgroundGlitch,
  drawAmbilight,
} from '../grading';
import { drawFog, drawAurora, spawnLightLeak, drawLightLeaks } from '../particles';
import { isLandscapeId } from '../../config/scenes';

import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
export function drawBackground(frame: RenderFrame, runtime: RenderRuntime) {
  const {
    context,
    stateRef,
    getBackgroundSource,
    drawBackgroundSource,
    colorSampleCanvasRef,
    processedOverlayRef,
    overlayImgRef,
    bgGlitchFrameRef,
    canvas,
    ambilightSampleCanvasRef,
    fogAuroraSeedRef,
    lightLeaksRef,
    landscapeRenderer,
  } = runtime;
  context.save();
  const automatic = stateRef.current.visualArrangementMode === 'auto';
  const scenePreset =
    automatic || stateRef.current.timelineVisual ? 'custom' : stateRef.current.scenePreset;
  const backgroundTime = automatic ? stateRef.current.autoImageElapsed : frame.trueTime;
  const isLandscape = isLandscapeId(scenePreset);
  if (!isLandscape) {
    context.translate(
      frame.smoothMouseX * 0.2 + stateRef.current.screenShakeX,
      frame.smoothMouseY * 0.2 + stateRef.current.screenShakeY,
    );
  }
  let introBlur = 0;
  if (frame.showIntroTitle && frame.currentTime <= 4) {
    introBlur =
      frame.currentTime <= 2.5 ? 40 : Math.max(0, 40 * (1 - (frame.currentTime - 2.5) / 1.5));
  }
  const filters = [];
  if (frame.showNostalgic) {
    filters.push(`sepia(0.5) contrast(1.1) brightness(0.9)`);
  }
  if (introBlur > 0) {
    filters.push(`blur(${introBlur}px)`);
  }
  const gradeFilter = getColorGradeFilter(frame.colorGradePreset);
  if (gradeFilter) {
    filters.push(gradeFilter);
  }
  if (stateRef.current.isBgTransitioning && frame.bgTransitionStyle === `blur-morph`) {
    const transitionBlur =
      Math.sin(Math.min(1, Math.max(0, frame.transitionProgress)) * Math.PI) * 30;
    if (transitionBlur > 0.5) {
      filters.push(`blur(${transitionBlur}px)`);
    }
  }
  if (filters.length > 0) {
    context.filter = filters.join(` `);
  }
  const bgBounce = stateRef.current.bgBounce;
  const backgroundScale = 1 + (frame.safeBass / 255) * bgBounce * 0.08;
  let backgroundSource: HTMLCanvasElement | HTMLImageElement | null = landscapeRenderer.render(
    scenePreset,
    stateRef.current.sceneSettings,
    frame.width,
    frame.height,
    frame.deltaSeconds,
  );
  if (backgroundSource) {
    // The GPU frame already contains photo + masks with a single cover projection.
    context.drawImage(backgroundSource, 0, 0, frame.width, frame.height);
  } else if (isLandscapeId(scenePreset)) {
    const source = getBackgroundSource(frame.bgList[0]);
    if (source) {
      const scale = Math.max(frame.width / source.width, frame.height / source.height);
      context.drawImage(
        source,
        (frame.width - source.width * scale) / 2,
        (frame.height - source.height * scale) / 2,
        source.width * scale,
        source.height * scale,
      );
    }
  } else if (frame.bgList.length > 0) {
    const eased =
      frame.transitionProgress < 0.5
        ? 2 * frame.transitionProgress * frame.transitionProgress
        : 1 - (-2 * frame.transitionProgress + 2) ** 2 / 2;
    const currentMedia = frame.bgList[stateRef.current.currentBgIndex];
    backgroundSource = getBackgroundSource(currentMedia);
    const elapsed = backgroundTime - stateRef.current.currentBgStartTime;
    if (stateRef.current.isBgTransitioning) {
      const nextMedia = frame.bgList[stateRef.current.nextBgIndex];
      const nextSource = getBackgroundSource(nextMedia);
      const nextElapsed = backgroundTime - stateRef.current.bgTransitionStart;
      if (backgroundSource) {
        context.save();
        context.globalAlpha = Math.max(0, 1 - eased);
        context.translate(frame.width / 2, frame.height / 2);
        const outgoingScale = (1 + eased * 0.1) * backgroundScale;
        context.scale(outgoingScale, outgoingScale);
        context.rotate(eased * 0.02);
        drawBackgroundSource(
          backgroundSource,
          currentMedia,
          stateRef.current.currentBgIndex,
          elapsed,
          frame.intervalSeconds,
          frame.transitionSeconds,
          frame.width,
          frame.height,
        );
        context.restore();
      }
      if (nextSource) {
        context.save();
        context.globalAlpha = Math.max(0, eased);
        context.translate(frame.width / 2, frame.height / 2);
        const incomingScale = (1.1 - eased * 0.1) * backgroundScale;
        context.scale(incomingScale, incomingScale);
        context.rotate(-(1 - eased) * 0.02);
        drawBackgroundSource(
          nextSource,
          nextMedia,
          stateRef.current.nextBgIndex,
          nextElapsed,
          frame.intervalSeconds,
          frame.transitionSeconds,
          frame.width,
          frame.height,
        );
        context.restore();
      }
    } else {
      if (backgroundSource) {
        context.save();
        context.translate(frame.width / 2, frame.height / 2);
        context.scale(backgroundScale, backgroundScale);
        drawBackgroundSource(
          backgroundSource,
          currentMedia,
          stateRef.current.currentBgIndex,
          elapsed,
          frame.intervalSeconds,
          frame.transitionSeconds,
          frame.width,
          frame.height,
        );
        context.restore();
      }
    }
  }
  context.filter = `none`;
  if (
    stateRef.current.colorMode === `auto-image` &&
    backgroundSource &&
    colorSampleCanvasRef.current === null
  ) {
    colorSampleCanvasRef.current = document.createElement(`canvas`);
  }
  if (
    stateRef.current.colorMode === `auto-image` &&
    backgroundSource &&
    colorSampleCanvasRef.current &&
    frame.playbackClock - stateRef.current.lastColorSampleTick > 1
  ) {
    stateRef.current.lastColorSampleTick = frame.playbackClock;
    const sampledColor = sampleImageColor(colorSampleCanvasRef.current, backgroundSource, 16);
    if (sampledColor) {
      stateRef.current.autoColorTarget = sampledColor;
    }
  }
  const overlaySource = processedOverlayRef.current || overlayImgRef.current;
  if (
    overlaySource &&
    (!(overlaySource instanceof HTMLImageElement) || overlaySource.complete) &&
    overlaySource.width > 0
  ) {
    context.save();
    context.globalCompositeOperation = stateRef.current
      .overlayBlendMode as GlobalCompositeOperation;
    context.translate(frame.width / 2, frame.height / 2);
    const overlayBounce = stateRef.current.overlayBounce;
    if (overlayBounce > 0) {
      const pulse = (frame.safeBass / 255) * overlayBounce;
      const scale = 1 + pulse * 0.08;
      const offsetY = -pulse * 15;
      context.translate(0, offsetY);
      context.scale(scale, scale);
    }
    const sourceWidth = overlaySource.width;
    const sourceHeight = overlaySource.height;
    const coverScale = Math.max(frame.width / sourceWidth, frame.height / sourceHeight);
    const drawWidth = sourceWidth * coverScale;
    const drawHeight = sourceHeight * coverScale;
    context.drawImage(overlaySource, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();
  }
  drawColorGrade(context, frame.colorGradePreset, frame.width, frame.height);
  if (frame.showBgGlitch) {
    if (
      stateRef.current.beatJustFired &&
      (!bgGlitchFrameRef.current ||
        bgGlitchFrameRef.current.builtAtBeat !== stateRef.current.lastBeatTime)
    ) {
      bgGlitchFrameRef.current = createGlitchFrame(
        canvas,
        frame.width,
        frame.height,
        stateRef.current.lastBeatTime,
      );
    }
    drawBackgroundGlitch(
      context,
      bgGlitchFrameRef.current,
      frame.beatPulse,
      frame.bgGlitchIntensity,
      frame.width,
      frame.height,
    );
  }
  if (frame.showAmbilight) {
    ambilightSampleCanvasRef.current ||= document.createElement(`canvas`);
    if (backgroundSource && frame.playbackClock - stateRef.current.lastAmbilightSampleTime > 0.75) {
      stateRef.current.lastAmbilightSampleTime = frame.playbackClock;
      const sampledColor = sampleImageColor(ambilightSampleCanvasRef.current, backgroundSource, 12);
      if (sampledColor) {
        stateRef.current.ambilightColor = sampledColor;
      }
    }
    drawAmbilight(
      context,
      stateRef.current.ambilightColor || frame.themeColor,
      frame.ambilightIntensity,
      frame.time,
      (frame.safeBass + frame.safeMid) / 510,
      frame.width,
      frame.height,
    );
  }
  if (frame.ambientDriftMode === `fog`) {
    drawFog(context, fogAuroraSeedRef.current, frame.time, frame.width, frame.height);
  } else {
    if (frame.ambientDriftMode === `aurora`) {
      drawAurora(context, fogAuroraSeedRef.current, frame.time, frame.width, frame.height);
    } else {
      fogAuroraSeedRef.current.length = 0;
    }
  }
  if (
    frame.showLightLeak &&
    frame.isPlaying &&
    frame.time - stateRef.current.lastLightLeakTime > stateRef.current.nextLightLeakDelay
  ) {
    stateRef.current.lastLightLeakTime = frame.time;
    stateRef.current.nextLightLeakDelay = 4 + Math.random() * 5;
    spawnLightLeak(lightLeaksRef.current, frame.time, frame.themeColor);
  }
  lightLeaksRef.current = drawLightLeaks(
    context,
    lightLeaksRef.current,
    frame.time,
    frame.width,
    frame.height,
  );
  context.restore();
}
