import { expect, test, type Page } from '@playwright/test';
import type { SceneRenderer } from '../../src/engine/scenes/SceneRenderer';
import type { LandscapeId, SceneSettings } from '../../src/config/scenes';

test('retries a failed scene texture without flooding requests', async ({ page }) => {
  let requests = 0;
  await page.route('**/forest-water-mask.png', async (route) => {
    requests++;
    if (requests === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/engine/scenes/SceneRenderer.ts';
    const configPath = '/src/config/scenes.ts';
    const { SceneRenderer } = await import(/* @vite-ignore */ modulePath);
    const { createSceneSettings } = await import(/* @vite-ignore */ configPath);
    const errors: string[] = [];
    const renderer = new SceneRenderer((error: string) => errors.push(error));
    const settings = createSceneSettings();
    await renderer.prepare('forest');
    for (let index = 0; index < 60; index++) renderer.render('forest', settings, 320, 180, 1 / 60);
    await renderer.prepare('forest');
    const canvas = renderer.render('forest', settings, 320, 180, 0);
    const capture = document.createElement('canvas');
    capture.width = 320;
    capture.height = 180;
    const context = capture.getContext('2d')!;
    if (canvas) context.drawImage(canvas, 0, 0);
    const bright = context
      .getImageData(0, 0, 320, 180)
      .data.filter((value, index) => index % 4 !== 3 && value > 10).length;
    renderer.dispose();
    return { errors, bright };
  });
  expect(requests).toBe(2);
  expect(result.errors).toHaveLength(1);
  expect(result.bright).toBeGreaterThan(1000);
});

declare global {
  interface Window {
    sceneHarness: {
      renderer: SceneRenderer;
      settings: SceneSettings;
      snapshots: Map<string, Uint8ClampedArray>;
      errors: string[];
    };
  }
}

async function snapshot(
  page: Page,
  sceneId: LandscapeId,
  name: string,
  changes: Partial<SceneSettings> = {},
  ticks = 0,
) {
  return page.evaluate(
    async ({ sceneId, name, changes, ticks }) => {
      const harness = window.sceneHarness;
      Object.assign(harness.settings, changes);
      await harness.renderer.prepare(sceneId);
      let canvas = harness.renderer.render(sceneId, harness.settings, innerWidth, innerHeight, 0);
      for (let index = 0; index < ticks; index++)
        canvas = harness.renderer.render(sceneId, harness.settings, innerWidth, innerHeight, 0.1);
      if (!canvas) throw new Error(`No GPU frame: ${sceneId}: ${harness.errors.join(', ')}`);
      const capture = document.createElement('canvas');
      capture.width = canvas.width;
      capture.height = canvas.height;
      const context = capture.getContext('2d')!;
      context.drawImage(canvas, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      harness.snapshots.set(name, pixels);
      return pixels.filter((value, index) => index % 4 !== 3 && value > 10).length;
    },
    { sceneId, name, changes, ticks },
  );
}

// Regions are expressed in source-photo coordinates, so the same assertions cover portrait crops.
async function difference(page: Page, first: string, second: string, region: number[]) {
  return page.evaluate(
    ({ first, second, region }) => {
      const firstPixels = window.sceneHarness.snapshots.get(first)!;
      const secondPixels = window.sceneHarness.snapshots.get(second)!;
      const scale = Math.max(innerWidth / 1672, innerHeight / 941);
      const offsetX = (innerWidth - 1672 * scale) / 2;
      const offsetY = (innerHeight - 941 * scale) / 2;
      const left = Math.max(0, Math.ceil(region[0] * 1672 * scale + offsetX));
      const top = Math.max(0, Math.ceil(region[1] * 941 * scale + offsetY));
      const right = Math.min(innerWidth, Math.floor(region[2] * 1672 * scale + offsetX));
      const bottom = Math.min(innerHeight, Math.floor(region[3] * 941 * scale + offsetY));
      let total = 0;
      let changed = 0;
      let samples = 0;
      for (let y = top; y < bottom; y++)
        for (let x = left; x < right; x++) {
          const index = (y * innerWidth + x) * 4;
          const delta =
            Math.abs(firstPixels[index] - secondPixels[index]) +
            Math.abs(firstPixels[index + 1] - secondPixels[index + 1]) +
            Math.abs(firstPixels[index + 2] - secondPixels[index + 2]);
          total += delta;
          if (delta > 3) changed++;
          samples++;
        }
      return { mean: total / Math.max(1, samples), changed, samples };
    },
    { first, second, region },
  );
}

for (const viewport of [
  { width: 960, height: 540 },
  { width: 540, height: 960 },
]) {
  test(`scene shaders animate only within their calibrated regions ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
        errors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(async () => {
      const rendererPath = '/src/engine/scenes/SceneRenderer.ts';
      const configPath = '/src/config/scenes.ts';
      const { SceneRenderer } = await import(/* @vite-ignore */ rendererPath);
      const { createSceneSettings } = await import(/* @vite-ignore */ configPath);
      const errors: string[] = [];
      const renderer = new SceneRenderer((message: string) => errors.push(message));
      window.sceneHarness = {
        renderer,
        settings: createSceneSettings(),
        snapshots: new Map(),
        errors,
      };
      renderer.canvas.id = 'scene-test';
      Object.assign(renderer.canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '9999',
      });
      document.body.append(renderer.canvas);
    });
    for (const sceneId of [
      'aurora-fjord',
      'nordic-cabin',
      'kyoto',
      'forest',
      'hallstatt',
    ] as LandscapeId[]) {
      expect(await snapshot(page, sceneId, `${sceneId}-start`)).toBeGreaterThan(10000);
      await snapshot(page, sceneId, `${sceneId}-moving`, {}, 20);
      expect(
        (await difference(page, `${sceneId}-start`, `${sceneId}-moving`, [0, 0, 1, 1])).changed,
      ).toBeGreaterThan(15);
      await page
        .locator('#scene-test')
        .screenshot({ path: `test-results/${sceneId}-${viewport.width}.png` });
    }
    await snapshot(page, 'nordic-cabin', 'snow-first', { cabinFireBrightness: 0 });
    await snapshot(page, 'nordic-cabin', 'snow-second', {}, 20);
    expect(
      (await difference(page, 'snow-first', 'snow-second', [0.32, 0.2, 0.43, 0.48])).changed,
    ).toBeGreaterThan(10);
    expect(
      (await difference(page, 'snow-first', 'snow-second', [0.36, 0.7, 0.64, 0.96])).mean,
    ).toBe(0);
    expect(
      (await difference(page, 'snow-first', 'snow-second', [0.45, 0.17, 0.54, 0.6])).mean,
    ).toBe(0);

    await snapshot(page, 'kyoto', 'rain-off', {
      kyotoRainIntensity: 0,
      sceneAnimationEnabled: false,
    });
    await snapshot(page, 'kyoto', 'rain-on', { kyotoRainIntensity: 100 });
    expect(
      (await difference(page, 'rain-off', 'rain-on', [0.34, 0.2, 0.65, 0.55])).changed,
    ).toBeGreaterThan(30);
    expect((await difference(page, 'rain-off', 'rain-on', [0.34, 0.75, 0.65, 0.95])).mean).toBe(0);

    await snapshot(page, 'forest', 'water-first', { sceneAnimationEnabled: true });
    await snapshot(page, 'forest', 'water-second', {}, 20);
    expect(
      (await difference(page, 'water-first', 'water-second', [0.36, 0.4, 0.65, 0.7])).changed,
    ).toBeGreaterThan(100);
    expect(
      (await difference(page, 'water-first', 'water-second', [0.34, 0.82, 0.65, 0.95])).mean,
    ).toBe(0);

    await snapshot(page, 'forest', 'paused-first', { sceneAnimationEnabled: false });
    await snapshot(page, 'forest', 'paused-second', {}, 20);
    expect((await difference(page, 'paused-first', 'paused-second', [0, 0, 1, 1])).mean).toBe(0);
    expect(await page.evaluate(() => window.sceneHarness.errors)).toEqual([]);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.sceneHarness.renderer.dispose());
  });
}
