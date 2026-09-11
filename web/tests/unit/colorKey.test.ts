import { expect, it } from 'vitest';
import { applyColorKey } from '../../src/services/colorKey';

it('removes exact matches at zero tolerance without division by zero', () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 128]);
  expect([...applyColorKey(pixels, '#000000', 0)]).toEqual([0, 0, 0, 0, 255, 255, 255, 128]);
});

it('preserves transparency of softened edges', () => {
  const pixels = new Uint8ClampedArray([19, 19, 19, 100]);
  applyColorKey(pixels, '#000000', 10);
  expect(pixels[3]).toBeGreaterThan(0);
  expect(pixels[3]).toBeLessThan(100);
});
