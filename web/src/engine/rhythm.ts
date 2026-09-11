import type { RenderState } from './resources';
export const updateBeat = (state: RenderState, energy: number, time: number, step = 1) => {
  const beatEnergyHistory = state.beatEnergyHistory;
  state.beatSampleAccumulator += step;
  while (state.beatSampleAccumulator >= 1) {
    beatEnergyHistory.push(energy);
    if (beatEnergyHistory.length > 43) beatEnergyHistory.shift();
    state.beatSampleAccumulator--;
  }
  if (!beatEnergyHistory.length) return;
  const mean =
    beatEnergyHistory.reduce((sum, sample) => sum + sample, 0) / beatEnergyHistory.length;
  const variance =
    beatEnergyHistory.reduce((sum, sample) => sum + (sample - mean) * (sample - mean), 0) /
    beatEnergyHistory.length;
  if (
    energy > mean + Math.sqrt(variance) * 1.5 + 15 &&
    energy > 40 &&
    time - state.lastBeatTime > 0.22
  ) {
    state.lastBeatTime = time;
    state.beatPulse = 1;
    state.beatJustFired = true;
  } else {
    state.beatPulse *= 0.88 ** step;
    if (state.beatPulse < 0.001) {
      state.beatPulse = 0;
    }
    state.beatJustFired = false;
  }
};
export const drawBeatStrobe = (
  context: CanvasRenderingContext2D,
  state: RenderState,
  color: string,
  width: number,
  height: number,
) => {
  if (!(!state.showBeatStrobe || state.beatPulse <= 0.01)) {
    context.save();
    context.globalCompositeOperation = `lighter`;
    context.globalAlpha = state.beatPulse * (state.beatStrobeIntensity / 5) * 0.35;
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
    context.restore();
  }
};
export const updateScreenPunch = (
  state: RenderState,
  energy: number,
  intensity: number,
  step = 1,
) => {
  if (state.beatJustFired && energy > 150) {
    const punchStrength = Math.min(1, (energy - 150) / 105) * (intensity / 5);
    state.screenShakeX = (Math.random() - 0.5) * 18 * punchStrength;
    state.screenShakeY = (Math.random() - 0.5) * 18 * punchStrength;
    state.screenShakeScale = 1 + 0.035 * punchStrength;
  } else {
    state.screenShakeX *= 0.85 ** step;
    state.screenShakeY *= 0.85 ** step;
    state.screenShakeScale = 1 + (state.screenShakeScale - 1) * 0.85 ** step;
  }
};
