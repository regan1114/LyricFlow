export const REFERENCE_FPS = 60;

export function frameStep(deltaSeconds: number): number {
  return Math.max(0, Math.min(0.1, deltaSeconds)) * REFERENCE_FPS;
}

export function smoothingFactor(factor: number, step: number): number {
  return 1 - (1 - factor) ** step;
}

export function emissionCount(perFrame: number, step: number): number {
  const expected = Math.max(0, perFrame * step);
  const whole = Math.floor(expected);
  return whole + (Math.random() < expected - whole ? 1 : 0);
}
