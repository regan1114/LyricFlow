import type { StudioSettings } from '../config/settings';
import { createSceneSettings } from '../config/scenes';
import type { VisualMedia } from '../composables/useMediaLibrary';
import type { SubtitleCue } from '../domain/subtitles';
import { TextBitmapCache } from './textBitmap';
import type {
  ColorParticle,
  PhoneticParticle,
  RainParticle,
  DustParticle,
  PetalParticle,
  FireflyParticle,
  SnowParticle,
  FireworkParticle,
  LightLeak,
  DriftSeed,
  DepthParticle,
  FloatingText,
  LyricParticle,
  Point,
} from './particleTypes';

export interface Slot<Value> {
  current: Value;
}
// Mutable resource slots stay outside Vue's reactive graph and are shared by render passes.
const slot = <Value>(current: Value): Slot<Value> => ({ current });

export function createRenderResources() {
  return {
    canvasRef: slot<HTMLCanvasElement | null>(null),
    audioRef: slot<HTMLAudioElement | null>(null),
    audioContextRef: slot<AudioContext | null>(null),
    analyserRef: slot<AnalyserNode | null>(null),
    sourceRef: slot<AudioNode | null>(null),
    animationRef: slot<number | null>(null),
    imageCache: slot<Record<string, HTMLImageElement>>({}),
    videoRefs: slot<Record<string, HTMLVideoElement & { _playPending?: boolean }>>({}),
    cacheCanvases: slot<Record<string, HTMLCanvasElement>>({}),
    textCacheRef: slot(new TextBitmapCache()),
    frequencyDataRef: slot(new Uint8Array(256)),
    waveformDataRef: slot(new Uint8Array(512).fill(128)),
    effectParticlesRef: slot<Record<string, LyricParticle[]>>({}),
    floatingTextsRef: slot<FloatingText[]>([]),
    smoothTitleRef: slot({ spacing: 12, alpha: 0.5, glow: 0 }),
    smoothFooterRef: slot({ spacing: 10, alpha: 0.4, glow: 0 }),
    smoothVignetteAlpha: slot(0.2),
    smoothVignetteRadius: slot(1),
    core: slot({ baseX: 480, x: 480, y: 540, history: [] as (Point & { time: number })[] }),
    depthElements: slot<DepthParticle[]>([]),
    particles: slot<ColorParticle[]>([]),
    zhuyinParticles: slot<PhoneticParticle[]>([]),
    sakuraParticles: slot<PetalParticle[]>([]),
    dustParticles: slot<DustParticle[]>([]),
    rainParticlesRef: slot<RainParticle[]>([]),
    firefliesRef: slot<FireflyParticle[]>([]),
    snowParticlesRef: slot<SnowParticle[]>([]),
    progressBarRef: slot<HTMLInputElement | null>(null),
    isDraggingRef: slot(false),
    progressParticles: slot<(ColorParticle & { size: number })[]>([]),
    overlayImgRef: slot<HTMLImageElement | null>(null),
    processedOverlayRef: slot<HTMLImageElement | HTMLCanvasElement | null>(null),
    logoImgRef: slot<HTMLImageElement | null>(null),
    logoVideoRef: slot<HTMLVideoElement | null>(null),
    coreImageRef: slot<HTMLImageElement | null>(null),
    coreVideoRef: slot<HTMLVideoElement | null>(null),
    coreMediaCacheRef: slot<{
      canvas: HTMLCanvasElement;
      src: string;
      type: 'image' | 'video';
    } | null>(null),
    colorSampleCanvasRef: slot<HTMLCanvasElement | null>(null),
    bgGlitchFrameRef: slot<{
      red: HTMLCanvasElement;
      cyan: HTMLCanvasElement;
      builtAtBeat: number;
    } | null>(null),
    lightLeaksRef: slot<LightLeak[]>([]),
    ambilightSampleCanvasRef: slot<HTMLCanvasElement | null>(null),
    fireworksParticlesRef: slot<FireworkParticle[]>([]),
    fogAuroraSeedRef: slot<DriftSeed[]>([]),
  };
}

export type RenderResources = ReturnType<typeof createRenderResources>;

export function createRenderState(settings: StudioSettings) {
  return {
    ...settings,
    sceneSettings: createSceneSettings(),
    isPlaying: false,
    bassIntensity: 0,
    midIntensity: 0,
    time: 0,
    currentTime: 0,
    lastActiveIdx: -1,
    transitionStartTime: 0,
    currentMotionEffect: 0,
    mouseX: 0,
    mouseY: 0,
    smoothMouseX: 0,
    smoothMouseY: 0,
    rawLyrics: '',
    beatPulse: 0,
    lastElvenSpawnTime: 0,
    lastFloatingSpawnTime: 0,
    nextFloatingDelay: 1,
    customFont: settings.selectedFont,
    orbRadius: 28,
    lastColorChangeTime: -15,
    autoColorTarget: settings.themeColor,
    lastAutoColorSampleTime: -15,
    lastColorSampleTick: -15,
    bgList: [] as VisualMedia[],
    visualArrangementMode: 'auto' as 'manual' | 'auto',
    autoImageElapsed: 0,
    timelineDuration: null as number | null,
    timelineVisual: null as VisualMedia | null,
    currentBgIndex: 0,
    nextBgIndex: 0,
    lastBgSwitchTime: null as number | null,
    currentBgStartTime: 0,
    isBgTransitioning: false,
    bgTransitionStart: 0,
    randomBgQueue: [] as number[],
    logoType: null as 'image' | 'video' | null,
    coreMediaType: null as 'image' | 'video' | null,
    wallTime: 0,
    lastPerfTime: null as number | null,
    trueTime: 0,
    smoothScrollY: 0,
    smoothActiveIdx: 0,
    vinylAngle: 0,
    vinylAngularVelocity: 0,
    beatEnergyHistory: [] as number[],
    beatSampleAccumulator: 0,
    lastBeatTime: -10,
    beatJustFired: false,
    screenShakeX: 0,
    screenShakeY: 0,
    screenShakeScale: 1,
    parsedLyrics: [] as SubtitleCue[],
    lastLightLeakTime: 0,
    nextLightLeakDelay: 4,
    ambilightColor: settings.themeColor,
    lastAmbilightSampleTime: -15,
  };
}
export type RenderState = ReturnType<typeof createRenderState>;

export function normalizeFontFamily(fontFamily: string) {
  if (fontFamily.includes('"') || fontFamily.includes("'")) return fontFamily;
  const genericFamilies = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
  ]);
  return fontFamily
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => (genericFamilies.has(name) ? name : `"${name}"`))
    .join(', ');
}
