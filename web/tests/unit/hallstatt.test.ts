import { describe, expect, it } from 'vitest';
import {
  bestProgress,
  ephemeris,
  localMidnight,
  makeRange,
  phaseNight,
  validDate,
  viewport,
  viewportStatus,
} from '../../src/engine/scenes/hallstattModel';

describe('Hallstatt astronomical scene', () => {
  it('uses Austrian local dates including daylight saving time', () => {
    expect(localMidnight('2026-01-01').toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(localMidnight('2026-07-01').toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('2026-10-20')).toBe(true);
    expect(validDate('')).toBe(false);
  });
  it('projects real sun and moon positions into the visible sky, never into the terrain', () => {
    for (const mode of ['day', 'night'] as const) {
      const range = makeRange(mode, mode === 'day' ? '2026-10-20' : '2026-08-28');
      const view = viewport(1920, 1080);
      const progress = bestProgress(mode, range, view);
      expect(progress).not.toBeNull();
      const sky = ephemeris(mode, range, progress!);
      expect(viewportStatus(sky.body, view)).toBe('visible');
      expect(sky.body.altitude).toBeGreaterThan(0);
      expect(sky.moonSurface.radius).toBeGreaterThan(0.004);
      expect(sky.moonSurface.radius).toBeLessThan(0.0055);
    }
  });
  it('selecting a full moon resolves to an actual nearby night', () => {
    const date = phaseNight(180, '2026-08-15');
    const sky = ephemeris('night', makeRange('night', date), 0.5);
    expect(sky.illumination).toBeGreaterThan(0.95);
  });
});
