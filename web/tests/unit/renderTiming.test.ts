import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSettings } from '../../src/config/settings';
import { createRenderResources, createRenderState } from '../../src/engine/resources';
import { createRenderFrame } from '../../src/engine/frame';
import { updateFrame } from '../../src/engine/passes/updateFrame';
import { drawFireworks, drawSnow } from '../../src/engine/particles';
import { frameStep, smoothingFactor, emissionCount } from '../../src/engine/animation';
import type { RenderRuntime } from '../../src/engine/renderer';
import { TextBitmapCache } from '../../src/engine/textBitmap';

afterEach(() => vi.restoreAllMocks());

function contextStub() {
  return {
    setTransform() {},
    fillRect() {},
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    fill() {},
    translate() {},
    rotate() {},
  } as unknown as CanvasRenderingContext2D;
}

function timingHarness() {
  const resources = createRenderResources();
  const stateRef = { current: createRenderState(createSettings()) };
  const runtime: RenderRuntime = {
    ...resources,
    stateRef,
    canvas: { width: 640, height: 360 } as HTMLCanvasElement,
    context: contextStub(),
    onThemeColorChange: vi.fn(),
    getBackgroundSource: vi.fn(),
    drawBackgroundSource: vi.fn(),
    landscapeRenderer: { render: vi.fn(), dispose: vi.fn() },
  };
  return { resources, runtime, frame: createRenderFrame(stateRef.current, resources) };
}

describe('frame-rate independent animation', () => {
  it.each([30, 60, 120])('keeps the same effect clock after one second at %i FPS', (fps) => {
    const { frame, runtime } = timingHarness();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    updateFrame(frame, runtime);
    for (let index = 0; index < fps; index++) {
      now += 1000 / fps;
      updateFrame(frame, runtime);
    }
    expect(frame.time).toBeCloseTo(0.9, 8);
    expect(frame.trueTime).toBeCloseTo(1, 8);
  });

  it('reuses analyser buffers and only reallocates when FFT dimensions change', () => {
    const { resources, frame, runtime } = timingHarness();
    updateFrame(frame, runtime);
    const frequency = frame.frequencyData;
    const waveform = frame.waveformData;
    updateFrame(frame, runtime);
    expect(frame.frequencyData).toBe(frequency);
    expect(frame.waveformData).toBe(waveform);
    expect([...waveform]).toEqual(Array(512).fill(128));
    resources.analyserRef.current = {
      frequencyBinCount: 1024,
      fftSize: 2048,
      getByteFrequencyData: (data: Uint8Array) => data.fill(20),
      getByteTimeDomainData: (data: Uint8Array) => data.fill(128),
    } as unknown as AnalyserNode;
    updateFrame(frame, runtime);
    expect(frame.frequencyData).not.toBe(frequency);
    const resized = frame.frequencyData;
    updateFrame(frame, runtime);
    expect(frame.frequencyData).toBe(resized);
    expect(frame.safeBass).toBe(20);
  });

  it.each([30, 60, 120])('preserves snow motion, gravity, decay and smoothing at %i FPS', (fps) => {
    const step = frameStep(1 / fps);
    const snow = { x: 0, y: 0, vx: 1, vy: 2, drift: 0, alpha: 1, size: 1 };
    const spark = {
      x: 0,
      y: 0,
      vx: 1,
      vy: 0,
      rot: 0,
      spin: 0.1,
      life: 2,
      size: 1,
      color: 'white',
      isConfetti: false,
    };
    let position = 0;
    for (let index = 0; index < fps; index++) {
      drawSnow(contextStub(), [snow], 0, 1000, step);
      drawFireworks(contextStub(), [spark], step);
      position += (100 - position) * smoothingFactor(0.05, step);
    }
    expect(snow.y).toBeCloseTo(120, 8);
    expect(spark.x).toBeCloseTo(60, 8);
    expect(spark.y).toBeCloseTo(216, 8);
    expect(spark.life).toBeCloseTo(1.16, 8);
    expect(position).toBeCloseTo(100 * (1 - 0.95 ** 60), 8);
  });

  it('bounds catch-up after background tab suspension and supports multiple emissions', () => {
    expect(frameStep(60)).toBe(6);
    expect(frameStep(-1)).toBe(0);
    expect(emissionCount(0.5, 6)).toBe(3);
    expect(emissionCount(1, 0)).toBe(0);
  });
});

describe('pixel-budget text cache', () => {
  const bitmap = (width = 10) => ({
    canvas: { width, height: 10 } as HTMLCanvasElement,
    width,
    paddingX: 0,
    paddingY: 0,
    color: 'white',
    paint: vi.fn(),
  });

  it('evicts the least recently used entry according to its pixel cost', () => {
    const cache = new TextBitmapCache(800);
    cache.set('first', bitmap());
    cache.set('second', bitmap());
    expect(cache.get('first')).toBeDefined();
    cache.set('third', bitmap());
    expect(cache.get('second')).toBeUndefined();
    expect(cache.get('first')).toBeDefined();
    expect(cache.bytes).toBe(800);
    cache.clear();
    expect(cache.bytes).toBe(0);
    expect(cache.size).toBe(0);
  });

  it('does not retain a bitmap larger than the entire budget', () => {
    const cache = new TextBitmapCache(400);
    cache.set('huge', bitmap(1000));
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });
});
