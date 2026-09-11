import { updateBeat, updateScreenPunch } from '../rhythm';
import { interpolateColor } from '../colors';
import { frameStep, smoothingFactor } from '../animation';
import type { RenderFrame } from '../frame';
import type { RenderRuntime } from '../renderer';
export function updateFrame(frame: RenderFrame, runtime: RenderRuntime) {
  const { canvas, context, stateRef, audioRef, isDraggingRef, analyserRef, onThemeColorChange } =
    runtime;
  frame.width = canvas.width;
  frame.height = canvas.height;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = `#010101`;
  context.fillRect(0, 0, frame.width, frame.height);
  const performanceTime = performance.now();
  if (stateRef.current.lastPerfTime === null) {
    stateRef.current.lastPerfTime = performanceTime;
  }
  frame.deltaSeconds = (performanceTime - stateRef.current.lastPerfTime) / 1e3;
  frame.frameStep = frameStep(frame.deltaSeconds);
  stateRef.current.lastPerfTime = performanceTime;
  stateRef.current.trueTime = (stateRef.current.trueTime || 0) + frame.deltaSeconds;
  frame.trueTime = stateRef.current.trueTime;
  const { bassImpactFactor, bassFrequencyLimit, showScreenPunch, screenPunchIntensity } =
    stateRef.current;
  frame.isPlaying = stateRef.current.isPlaying;
  frame.showNostalgic = stateRef.current.showNostalgic;
  frame.showElvenParticles = stateRef.current.showElvenParticles;
  frame.showRain = stateRef.current.showRain;
  frame.customFont = stateRef.current.customFont;
  frame.visualMode = stateRef.current.visualMode;
  frame.bgList = stateRef.current.bgList;
  frame.bgPlayMode = stateRef.current.bgPlayMode;
  frame.bgSwitchTrigger = stateRef.current.bgSwitchTrigger;
  frame.bgInterval = stateRef.current.bgInterval;
  frame.videoTransitionMode = stateRef.current.videoTransitionMode;
  frame.lyricsSize = stateRef.current.lyricsSize;
  frame.lyricsPosition = stateRef.current.lyricsPosition;
  frame.lyricsEffect = stateRef.current.lyricsEffect;
  frame.keywordsStr = stateRef.current.keywordsStr;
  frame.videoSpeed = stateRef.current.videoSpeed;
  frame.showVignette = stateRef.current.showVignette;
  frame.showWaveform = stateRef.current.showWaveform;
  frame.visualSize = stateRef.current.visualSize;
  frame.visualY = stateRef.current.visualY;
  frame.showBokeh = stateRef.current.showBokeh;
  frame.showIntroTitle = stateRef.current.showIntroTitle;
  frame.showFooter = stateRef.current.showFooter;
  frame.footerText = stateRef.current.footerText;
  frame.showFloatingText = stateRef.current.showFloatingText;
  frame.customFloatingText = stateRef.current.customFloatingText;
  frame.rawLyrics = stateRef.current.rawLyrics;
  frame.showFireflies = stateRef.current.showFireflies;
  frame.showSnow = stateRef.current.showSnow;
  frame.classicTagline = stateRef.current.classicTagline;
  frame.songName = stateRef.current.songName;
  frame.subTitle = stateRef.current.subTitle;
  frame.originalSinger = stateRef.current.originalSinger;
  frame.originalLyricist = stateRef.current.originalLyricist;
  frame.originalComposer = stateRef.current.originalComposer;
  frame.parsedLyrics = stateRef.current.parsedLyrics;
  frame.colorGradePreset = stateRef.current.colorGradePreset;
  frame.bgTransitionStyle = stateRef.current.bgTransitionStyle;
  frame.showBgGlitch = stateRef.current.showBgGlitch;
  frame.bgGlitchIntensity = stateRef.current.bgGlitchIntensity;
  frame.showLightLeak = stateRef.current.showLightLeak;
  frame.showAmbilight = stateRef.current.showAmbilight;
  frame.ambilightIntensity = stateRef.current.ambilightIntensity;
  frame.showFireworks = stateRef.current.showFireworks;
  frame.ambientDriftMode = stateRef.current.ambientDriftMode;
  frame.showKaraokeBall = stateRef.current.showKaraokeBall;
  frame.playbackClock = stateRef.current.wallTime || 0;
  if (frame.isPlaying && stateRef.current.timelineDuration !== null) {
    frame.playbackClock = stateRef.current.currentTime;
  } else if (frame.isPlaying && audioRef.current && !isDraggingRef.current) {
    frame.playbackClock = audioRef.current.currentTime;
    stateRef.current.currentTime = audioRef.current.currentTime;
  } else {
    frame.playbackClock += frame.deltaSeconds;
  }
  stateRef.current.wallTime = frame.playbackClock;
  stateRef.current.time += frame.frameStep * 0.015;
  frame.time = stateRef.current.time;
  frame.currentTime = stateRef.current.currentTime;
  const binCount = analyserRef.current?.frequencyBinCount || 256;
  const sampleCount = analyserRef.current?.fftSize || 512;
  if (runtime.frequencyDataRef.current.length !== binCount)
    runtime.frequencyDataRef.current = new Uint8Array(binCount);
  if (runtime.waveformDataRef.current.length !== sampleCount)
    runtime.waveformDataRef.current = new Uint8Array(sampleCount);
  frame.frequencyData = runtime.frequencyDataRef.current;
  frame.waveformData = runtime.waveformDataRef.current;
  if (analyserRef.current) {
    analyserRef.current.getByteFrequencyData(frame.frequencyData);
    analyserRef.current.getByteTimeDomainData(frame.waveformData);
    const bassBinCount = Math.max(1, Math.min(60, bassFrequencyLimit || 12));
    let bassTotal = 0;
    let midTotal = 0;
    for (let index = 0; index < bassBinCount; index++) bassTotal += frame.frequencyData[index];
    const midEnd = Math.min(binCount, bassBinCount + 70);
    for (let index = bassBinCount; index < midEnd; index++) midTotal += frame.frequencyData[index];
    stateRef.current.bassIntensity = bassTotal / bassBinCount;
    stateRef.current.midIntensity = midTotal / Math.max(1, midEnd - bassBinCount);
  } else {
    frame.frequencyData.fill(0);
    frame.waveformData.fill(128);
    stateRef.current.bassIntensity = 0;
    stateRef.current.midIntensity = 0;
  }
  const bassIntensity = stateRef.current.bassIntensity;
  const midIntensity = stateRef.current.midIntensity;
  const mouseX = stateRef.current.mouseX;
  const mouseY = stateRef.current.mouseY;
  frame.safeBass = isNaN(bassIntensity) ? 0 : Math.max(0, bassIntensity);
  frame.safeMid = isNaN(midIntensity) ? 0 : Math.max(0, midIntensity);
  const safeMouseX = isNaN(mouseX) ? 0 : mouseX;
  const safeMouseY = isNaN(mouseY) ? 0 : mouseY;
  updateBeat(stateRef.current, frame.safeBass, frame.trueTime, frame.frameStep);
  frame.beatPulse = stateRef.current.beatPulse;
  if (showScreenPunch) {
    updateScreenPunch(stateRef.current, frame.safeBass, screenPunchIntensity, frame.frameStep);
  } else {
    stateRef.current.screenShakeX = 0;
    stateRef.current.screenShakeY = 0;
    stateRef.current.screenShakeScale = 1;
  }
  if (stateRef.current.colorMode === `random`) {
    if (frame.playbackClock < stateRef.current.lastColorChangeTime) {
      stateRef.current.lastColorChangeTime = frame.playbackClock - 16;
    }
    if (frame.playbackClock - stateRef.current.lastColorChangeTime >= 16) {
      stateRef.current.lastColorChangeTime = frame.playbackClock;
      const themePalette = [
        `#a855f7`,
        `#3b82f6`,
        `#10b981`,
        `#ef4444`,
        `#f59e0b`,
        `#ec4899`,
        `#06b6d4`,
        `#eab308`,
        `#2dd4bf`,
      ];
      let themeColor = stateRef.current.themeColor;
      for (; themeColor === stateRef.current.themeColor;)
        themeColor = themePalette[Math.floor(Math.random() * themePalette.length)];
      stateRef.current.themeColor = themeColor;
      setTimeout(() => {
        onThemeColorChange(themeColor);
      }, 0);
    }
  } else if (
    stateRef.current.colorMode === `auto-image` &&
    ((stateRef.current.themeColor = interpolateColor(
      stateRef.current.themeColor,
      stateRef.current.autoColorTarget || stateRef.current.themeColor,
      smoothingFactor(0.03, frame.frameStep),
    )),
    frame.playbackClock - stateRef.current.lastAutoColorSampleTime >= 4)
  ) {
    stateRef.current.lastAutoColorSampleTime = frame.playbackClock;
    const themeColor = stateRef.current.themeColor;
    setTimeout(() => {
      onThemeColorChange(themeColor);
    }, 0);
  }
  frame.themeColor = stateRef.current.themeColor;
  stateRef.current.smoothMouseX +=
    (safeMouseX - stateRef.current.smoothMouseX) * smoothingFactor(0.05, frame.frameStep);
  stateRef.current.smoothMouseY +=
    (safeMouseY - stateRef.current.smoothMouseY) * smoothingFactor(0.05, frame.frameStep);
  frame.smoothMouseX = isNaN(stateRef.current.smoothMouseX) ? 0 : stateRef.current.smoothMouseX;
  frame.smoothMouseY = isNaN(stateRef.current.smoothMouseY) ? 0 : stateRef.current.smoothMouseY;
  frame.impactFactor = isNaN(bassImpactFactor) ? 1 : bassImpactFactor;
}
