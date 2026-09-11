import { describe, expect, it } from 'vitest';
import { createSettings } from '../../src/config/settings';
import { createSceneSettings } from '../../src/config/scenes';
import {
  createExportSettings,
  exportRange,
  exportDimensions,
  estimatedExportBytes,
  recordingMime,
} from '../../src/config/export';
import {
  packProject,
  unpackProject,
  validateManifest,
  type ProjectData,
} from '../../src/domain/project';
import { builtInPresets } from '../../src/config/presets';
function project(): ProjectData {
  return {
    manifest: {
      version: 1,
      settings: createSettings(),
      sceneSettings: createSceneSettings(),
      exportSettings: createExportSettings(),
      lyrics: '[00:01.00]測試歌詞',
      subtitleFilename: 'lyrics.lrc',
      visualMode: 'manual',
      linkSubtitles: true,
      volume: 0.5,
      assets: [{ id: 'a', name: '歌曲.wav', kind: 'audio', duration: 20, file: 0 }],
      clips: [
        {
          id: 'c',
          assetId: 'a',
          track: 'A2',
          start: 3,
          duration: 8,
          trimStart: 2,
          volume: 0.8,
          muted: false,
        },
      ],
      layers: { logo: 1, overlay: null, core: null },
    },
    files: [
      new File([new Uint8Array([0, 1, 255, 123])], '歌曲.wav', {
        type: 'audio/wav',
        lastModified: 100,
      }),
      new File(['logo'], 'logo.png', { type: 'image/png', lastModified: 200 }),
    ],
  };
}
describe('portable project format', () => {
  it('round trips original file bytes, names, metadata, timeline and lyrics without external URLs', async () => {
    const original = project();
    const restored = await unpackProject(packProject(original));
    expect(restored.manifest).toEqual(original.manifest);
    for (let index = 0; index < original.files.length; index++) {
      expect(restored.files[index].name).toBe(original.files[index].name);
      expect(restored.files[index].type).toBe(original.files[index].type);
      expect(restored.files[index].lastModified).toBe(original.files[index].lastModified);
      expect(await restored.files[index].arrayBuffer()).toEqual(
        await original.files[index].arrayBuffer(),
      );
    }
  });
  it('does not save invalid transient form values into an unreadable project', () => {
    const data = project();
    data.manifest.exportSettings.start = NaN;
    expect(() => packProject(data)).toThrow();
  });
  it('rejects truncated, unrelated and unsupported files', async () => {
    const packed = packProject(project());
    await expect(unpackProject(packed.slice(0, packed.size - 1))).rejects.toThrow();
    await expect(unpackProject(new Blob(['{}']))).rejects.toThrow();
    expect(() => validateManifest({ ...project().manifest, version: 2 }, 2)).toThrow();
  });
  it('rejects invalid references, duplicate ids and source bounds before media loading', () => {
    const data = project().manifest;
    expect(() => validateManifest({ ...data, layers: { ...data.layers, logo: 99 } }, 2)).toThrow();
    expect(() =>
      validateManifest({ ...data, clips: [{ ...data.clips[0], assetId: 'missing' }] }, 2),
    ).toThrow();
    expect(() =>
      validateManifest({ ...data, assets: [...data.assets, ...data.assets] }, 2),
    ).toThrow();
    expect(() =>
      validateManifest({ ...data, clips: [{ ...data.clips[0], duration: 100 }] }, 2),
    ).toThrow();
    expect(() =>
      validateManifest({ ...data, settings: { ...data.settings, bassImpactFactor: 100 } }, 2),
    ).toThrow();
    expect(() =>
      validateManifest({ ...data, settings: { ...data.settings, visualMode: 'invalid' } }, 2),
    ).toThrow();
    expect(() =>
      validateManifest({ ...data, exportSettings: { ...data.exportSettings, fps: 120 } }, 2),
    ).toThrow();
  });
  it.each(builtInPresets)('has valid settings for $name', (preset) => {
    const data = project().manifest;
    expect(() =>
      validateManifest(
        { ...data, settings: preset.settings, sceneSettings: preset.sceneSettings },
        2,
      ),
    ).not.toThrow();
  });
});
describe('export choices', () => {
  it('preserves aspect ratio, uses even dimensions and does not upscale', () => {
    expect(exportDimensions(1920, 1080, '720')).toEqual([1280, 720]);
    expect(exportDimensions(1080, 1920, '720')).toEqual([720, 1280]);
    expect(exportDimensions(1920, 1920, '1080')).toEqual([1080, 1080]);
    expect(exportDimensions(640, 360, '1080')).toEqual([640, 360]);
  });
  it('validates ranges and estimates audio plus video size', () => {
    const settings = createExportSettings();
    expect(exportRange(settings, 120)).toEqual({ start: 0, end: 120 });
    settings.range = 'custom';
    settings.start = 10;
    settings.end = 20;
    expect(exportRange(settings, 120)).toEqual({ start: 10, end: 20 });
    expect(() => exportRange({ ...settings, end: 121 }, 120)).toThrow();
    expect(() => exportRange({ ...settings, end: 10 }, 120)).toThrow();
    expect(() => exportRange({ ...settings, start: NaN }, 120)).toThrow();
    expect(estimatedExportBytes(120, 4)).toBe(61920000);
  });
  it('respects explicit format choice without silently substituting another container', () => {
    const onlyWebm = (mime: string) => mime.startsWith('video/webm');
    expect(recordingMime('mp4', onlyWebm)).toBeUndefined();
    expect(recordingMime('auto', onlyWebm)).toContain('video/webm');
  });
});
