import {
  createSettings,
  settingGroups,
  type StudioSettings,
  type SettingFieldConfig,
} from '../config/settings';
import { createSceneSettings, sceneSettingFields, type SceneSettings } from '../config/scenes';
import { createExportSettings, type ExportSettings } from '../config/export';
import { validateClip, type MediaClip, type MediaKind } from './mediaSequence';

export interface ProjectAsset {
  id: string;
  name: string;
  kind: MediaKind;
  duration: number;
  file: number;
}
export interface ProjectManifest {
  version: 1;
  settings: StudioSettings;
  sceneSettings: SceneSettings;
  exportSettings: ExportSettings;
  lyrics: string;
  subtitleFilename: string;
  visualMode: 'auto' | 'manual';
  linkSubtitles: boolean;
  volume: number;
  assets: ProjectAsset[];
  clips: MediaClip[];
  layers: { logo: number | null; core: number | null; overlay: number | null };
}
export interface ProjectData {
  manifest: ProjectManifest;
  files: File[];
}
const fail = (): never => {
  throw new Error('專案檔格式無效或版本不支援，原作品已保留。');
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
export function validatedSettings<T extends object>(
  value: unknown,
  defaults: T,
  fields: {
    key: string;
    min?: number;
    max?: number;
    options?: { value: unknown }[];
    type?: string;
  }[] = [],
): T {
  const input = object(value);
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const item = input[key];
    if (item === undefined) continue;
    const field = fields.find((field) => field.key === key);
    if (typeof item !== typeof defaults[key]) fail();
    if (
      typeof item === 'number' &&
      (!Number.isFinite(item) ||
        item < (field?.min ?? -Infinity) ||
        item > (field?.max ?? Infinity))
    )
      fail();
    if (field?.options && !field.options.some((option) => option.value === item)) fail();
    if (field?.type === 'color' && (typeof item !== 'string' || !/^#[0-9a-f]{6}$/i.test(item)))
      fail();
    if (
      field?.type === 'date' &&
      (typeof item !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(item) ||
        !Number.isFinite(Date.parse(item)))
    )
      fail();
    result[key] = item as T[keyof T & string];
  }
  return result;
}
export const validateStudioSettings = (value: unknown) =>
  validatedSettings(
    value,
    createSettings(),
    settingGroups.flatMap<SettingFieldConfig>((group) => group.fields),
  );
export const validateSceneSettings = (value: unknown) =>
  validatedSettings(value, createSceneSettings(), Object.values(sceneSettingFields).flat());
export function validateExportSettings(value: unknown) {
  return validatedSettings(value, createExportSettings(), [
    { key: 'resolution', options: ['original', '720', '1080'].map((value) => ({ value })) },
    { key: 'fps', options: [30, 60].map((value) => ({ value })) },
    { key: 'bitrate', options: [4, 8, 16].map((value) => ({ value })) },
    { key: 'format', options: ['auto', 'mp4', 'webm'].map((value) => ({ value })) },
    { key: 'range', options: ['all', 'custom'].map((value) => ({ value })) },
    { key: 'start', min: 0 },
    { key: 'end', min: 0 },
  ]);
}
export function validateManifest(value: unknown, fileCount: number): ProjectManifest {
  const data = object(value);
  if (
    data.version !== 1 ||
    typeof data.lyrics !== 'string' ||
    typeof data.subtitleFilename !== 'string' ||
    !['auto', 'manual'].includes(String(data.visualMode)) ||
    typeof data.linkSubtitles !== 'boolean' ||
    typeof data.volume !== 'number' ||
    !Number.isFinite(data.volume) ||
    data.volume < 0 ||
    data.volume > 1
  )
    fail();
  const fileIndex = (value: unknown): value is number =>
    Number.isInteger(value) && Number(value) >= 0 && Number(value) < fileCount;
  if (!Array.isArray(data.assets) || !Array.isArray(data.clips)) return fail();
  const assetIds = new Set<string>();
  const assets = data.assets.map((value) => {
    const asset = object(value);
    if (
      typeof asset.id !== 'string' ||
      !asset.id ||
      assetIds.has(asset.id) ||
      typeof asset.name !== 'string' ||
      !['audio', 'image', 'video'].includes(String(asset.kind)) ||
      typeof asset.duration !== 'number' ||
      !Number.isFinite(asset.duration) ||
      asset.duration <= 0 ||
      !fileIndex(asset.file)
    )
      fail();
    assetIds.add(asset.id as string);
    return asset as unknown as ProjectAsset;
  });
  const clipIds = new Set<string>();
  const clips = data.clips.map((value) => {
    const clip = object(value) as unknown as MediaClip;
    const asset = assets.find((asset) => asset.id === clip.assetId);
    if (
      !asset ||
      typeof clip.id !== 'string' ||
      !clip.id ||
      clipIds.has(clip.id) ||
      !['V1', 'A1', 'A2'].includes(clip.track) ||
      typeof clip.muted !== 'boolean' ||
      !validateClip(clip, asset.kind, asset.duration) ||
      (data.visualMode === 'auto' && clip.track === 'V1')
    )
      fail();
    clipIds.add(clip.id);
    return clip;
  });
  const layers = object(data.layers);
  for (const key of ['logo', 'core', 'overlay'])
    if (layers[key] !== null && !fileIndex(layers[key])) fail();
  return {
    version: 1,
    settings: validateStudioSettings(data.settings),
    sceneSettings: validateSceneSettings(data.sceneSettings),
    exportSettings: validateExportSettings(data.exportSettings),
    lyrics: data.lyrics as string,
    subtitleFilename: data.subtitleFilename as string,
    visualMode: data.visualMode as 'auto' | 'manual',
    linkSubtitles: data.linkSubtitles as boolean,
    volume: data.volume as number,
    assets,
    clips,
    layers: layers as ProjectManifest['layers'],
  };
}

// Length-prefixed JSON followed by original file bytes. No base64 expansion or external URLs.
const magic = new TextEncoder().encode('RESONANCE1\n');
const maxHeader = 16 * 1024 * 1024;
export function packProject({ manifest, files }: ProjectData): Blob {
  validateManifest(manifest, files.length);
  const header = new TextEncoder().encode(
    JSON.stringify({
      manifest,
      files: files.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
      })),
    }),
  );
  if (header.length > maxHeader) throw new Error('專案資料過大，無法儲存。');
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, header.length);
  return new Blob([magic, size, header, ...files], { type: 'application/octet-stream' });
}
export async function unpackProject(blob: Blob): Promise<ProjectData> {
  const prefix = new Uint8Array(await blob.slice(0, magic.length + 4).arrayBuffer());
  if (prefix.length !== magic.length + 4 || !magic.every((byte, index) => byte === prefix[index]))
    fail();
  const size = new DataView(prefix.buffer).getUint32(magic.length);
  let offset = magic.length + 4 + size;
  if (size > maxHeader || offset > blob.size) fail();
  const header = object(JSON.parse(await blob.slice(magic.length + 4, offset).text()));
  if (!Array.isArray(header.files)) return fail();
  const files = header.files.map((value) => {
    const file = object(value);
    if (
      typeof file.name !== 'string' ||
      typeof file.type !== 'string' ||
      typeof file.size !== 'number' ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      offset + file.size > blob.size ||
      typeof file.lastModified !== 'number' ||
      !Number.isFinite(file.lastModified)
    )
      fail();
    const result = new File([blob.slice(offset, offset + Number(file.size))], String(file.name), {
      type: String(file.type),
      lastModified: Number(file.lastModified),
    });
    offset += Number(file.size);
    return result;
  });
  if (offset !== blob.size) fail();
  return { manifest: validateManifest(header.manifest, files.length), files };
}
