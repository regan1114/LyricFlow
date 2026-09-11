import { createSettings, type StudioSettings } from './settings';
import { createSceneSettings, type SceneSettings } from './scenes';
export interface StylePreset {
  id: string;
  name: string;
  settings: StudioSettings;
  sceneSettings: SceneSettings;
}
// Content, canvas format and branding remain part of the project, not the visual style.
export const contentKeys = [
  'songName',
  'subTitle',
  'originalSinger',
  'originalLyricist',
  'originalComposer',
  'classicTagline',
  'footerText',
  'keywordsStr',
  'customFloatingText',
  'aspectRatio',
  'logoPosition',
  'logoOpacity',
  'logoScale',
  'overlayBlendMode',
  'overlayBounce',
  'enableColorKeying',
  'overlayKeyColor',
  'overlayKeyTolerance',
] as const satisfies readonly (keyof StudioSettings)[];
const preset = (id: string, name: string, settings: Partial<StudioSettings>): StylePreset => ({
  id,
  name,
  settings: { ...createSettings(), ...settings },
  sceneSettings: createSceneSettings(),
});
export const builtInPresets = [
  preset('ballad', '抒情字幕', {
    scenePreset: 'none',
    lyricsPosition: 'list-left',
    themeColor: '#e8c89a',
    waveformStyle: 'bar',
    visualSize: 60,
    bassImpactFactor: 0.4,
    bgBounce: 0.5,
  }),
  preset('lofi', 'Lo-fi 暖夜', {
    scenePreset: 'nordic-cabin',
    visualMode: 'vinyl',
    themeColor: '#d9a066',
    showBokeh: false,
    bgBounce: 0,
    bassImpactFactor: 0.3,
  }),
  preset('electronic', '電子節奏', {
    scenePreset: 'aurora-fjord',
    waveformStyle: 'radial',
    themeColor: '#a855f7',
    showNostalgic: false,
    showBokeh: false,
    showAmbilight: true,
    bassImpactFactor: 1.5,
    bgBounce: 1.5,
  }),
];
