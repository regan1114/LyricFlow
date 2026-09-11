export interface Point {
  x: number;
  y: number;
}
export interface MovingPoint extends Point {
  vx: number;
  vy: number;
}
export interface ColorParticle extends MovingPoint {
  life: number;
  color: string;
}
export interface PhoneticParticle extends MovingPoint {
  life: number;
  text: string;
  scale: number;
}
export interface RainParticle extends MovingPoint {
  length: number;
  alpha: number;
}
export interface DustParticle extends MovingPoint {
  size: number;
  alpha: number;
  flickerSpeed: number;
}
export interface PetalParticle extends MovingPoint {
  size: number;
  angle: number;
  spin: number;
  wobbleSpeed: number;
  color: string;
  alpha: number;
}
export interface FireflyParticle extends Point {
  seed: number;
  seed2: number;
  speed: number;
  size: number;
  life: number;
  glowPhase: number;
}
export interface SnowParticle extends MovingPoint {
  size: number;
  drift: number;
  alpha: number;
}
export interface FireworkParticle extends ColorParticle {
  size: number;
  isConfetti: boolean;
  rot: number;
  spin: number;
}
export interface LightLeak {
  angle: number;
  startTime: number;
  duration: number;
  color: string;
  band: number;
}
export interface DriftSeed {
  phase: number;
  speed: number;
  y: number;
  scale: number;
  hue: number;
}
export interface DepthParticle extends Point {
  z: number;
  size: number;
  speed: number;
  floatAmp: number;
  floatFreq: number;
  alpha: number;
  maxAlpha: number;
  seed: number;
}
export interface FloatingText extends Point {
  text: string;
  baseVx: number;
  size: number;
  maxAlpha: number;
  blur: number;
  seed: number;
  waveSpeed: number;
  waveAmp: number;
  startY: number;
  cachedCanvas: HTMLCanvasElement;
  padX: number;
  padY: number;
  canvasWidth: number;
  alpha?: number;
}
export interface LyricParticle {
  ox: number;
  oy: number;
  size: number;
}
