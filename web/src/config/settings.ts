import options from './options.json';
import { fontOptions } from './fonts';
import { scenePresets } from './scenes';

export type SettingValue = string | number | boolean;
export interface SettingOption {
  value: string | number;
  label: string;
}
export interface SettingFieldConfig {
  key: string;
  label: string;
  type: string;
  value: SettingValue;
  min?: number;
  max?: number;
  step?: number;
  options?: SettingOption[];
}

export const defaultLyrics = ``;

const text = <Key extends string>(key: Key, label: string, value = '') => ({
  key,
  label,
  type: 'text',
  value,
});
const toggle = <Key extends string>(key: Key, label: string, value = false) => ({
  key,
  label,
  type: 'checkbox',
  value,
});
const range = <Key extends string>(
  key: Key,
  label: string,
  value: number,
  min: number,
  max: number,
  step = 1,
) => ({
  key,
  label,
  type: 'range',
  value,
  min,
  max,
  step,
});
const select = <Key extends string, Value extends string | number>(
  key: Key,
  label: string,
  value: Value,
  choices: SettingOption[] = (options as Record<string, SettingOption[]>)[key],
) => ({
  key,
  label,
  type: 'select',
  value: value as Value extends number ? number : string,
  options: choices,
});

export const settingGroups = [
  {
    id: 'info',
    label: '歌曲資訊',
    fields: [
      text('songName', '歌曲名稱', ''),
      text('subTitle', '副標題', ''),
      text('originalSinger', '原唱'),
      text('originalLyricist', '作詞'),
      text('originalComposer', '作曲'),
      select('selectedFont', '字型', fontOptions[0].value, fontOptions),
      text('customFontInput', '本機字型名稱', '辰宇落雁體 2.0 Thin, ChenYuluoyan-Thin'),
      select('titleStyle', '標題呈現模式', 'classic'),
      text('classicTagline', '經典大字標語', ''),
      toggle('showIntroTitle', '片頭標題'),
      toggle('showFooter', '底部頻道資訊', true),
      text('footerText', '頻道文字', ''),
    ],
  },
  {
    id: 'background',
    label: '畫面與背景',
    fields: [
      select('scenePreset', '沉浸場景', 'none', [...scenePresets]),
      select('aspectRatio', '畫布比例', '16:9'),
      select('bgPlayMode', '背景輪播模式', 'sequential'),
      select('bgSwitchTrigger', '換頁觸發條件', 'time'),
      range('bgInterval', '輪播間隔 (秒)', 7, 3, 30),
      select('videoTransitionMode', '影片換頁規則', 'wait'),
      select('videoSpeed', '影片速度', 1),
      select('bgTransitionStyle', '背景轉場', 'crossfade'),
      range('bgBounce', '背景律動', 1, 0, 5, 0.5),
      select('colorGradePreset', '調色預設', 'none'),
    ],
  },
  {
    id: 'lyrics',
    label: '歌詞樣式',
    fields: [
      select('lyricsPosition', '排版位置', 'list-left'),
      select('lyricsEffect', '主字幕特效', 'default'),
      select('lyricsSize', '字幕大小', 'default'),
      text('keywordsStr', '強調關鍵字'),
      toggle('showKaraokeBall', '卡拉 OK 跳球'),
      toggle('showFloatingText', '氛圍直書'),
      { ...text('customFloatingText', '直書文字'), type: 'textarea' },
    ],
  },
  {
    id: 'visual',
    label: '光核與頻譜',
    fields: [
      select('visualMode', '光核模式', 'none'),
      range('coreMediaScale', '光核 / 唱片尺寸 (%)', 100, 10, 300),
      toggle('showWaveform', '顯示頻譜', true),
      select('waveformStyle', '頻譜樣式', 'none'),
      range('visualSize', '頻譜尺寸 (%)', 80, 15, 100),
      range('visualY', '頻譜垂直位置 (%)', 78, 15, 100),
      range('bassImpactFactor', '低頻衝擊', 1, 0, 2, 0.01),
      range('bassFrequencyLimit', '低頻取樣範圍', 12, 1, 50),
      select('colorMode', '配色模式', 'fixed', [
        { value: 'fixed', label: '固定色彩' },
        ...options.colorMode,
      ]),
      { ...text('themeColor', '主題色', '#f59e0b'), type: 'color' },
    ],
  },
  {
    id: 'effects',
    label: '氛圍特效',
    fields: [
      toggle('showNostalgic', '懷舊濾鏡', true),
      toggle('showVignette', '暗角', true),
      toggle('showBokeh', '散景', true),
      toggle('showSakura', '櫻花'),
      toggle('showRain', '雨絲'),
      toggle('showElvenParticles', '精靈粒子'),
      toggle('showFireflies', '螢火蟲'),
      toggle('showSnow', '飄雪'),
      toggle('showBeatStrobe', '節奏閃光'),
      range('beatStrobeIntensity', '閃光強度', 2, 1, 5, 0.5),
      toggle('showBgGlitch', '背景故障干擾'),
      range('bgGlitchIntensity', '干擾強度', 2, 1, 5, 0.5),
      toggle('showLightLeak', '漏光'),
      toggle('showAmbilight', '環境光暈'),
      range('ambilightIntensity', '光暈強度', 3, 1, 5, 0.5),
      toggle('showFireworks', '節奏煙火 / 彩帶'),
      select('ambientDriftMode', '霧氣 / 極光', 'off'),
      toggle('showScreenPunch', '節奏鏡頭衝擊'),
      range('screenPunchIntensity', '鏡頭衝擊強度', 3, 1, 5, 0.5),
    ],
  },
  {
    id: 'layers',
    label: 'Logo 與疊圖',
    fields: [
      select('logoPosition', 'Logo 位置', 'top-right'),
      range('logoOpacity', 'Logo 不透明度 (%)', 80, 1, 100),
      range('logoScale', 'Logo 尺寸 (%)', 25, 1, 100),
      select('overlayBlendMode', '疊圖混合模式', 'screen'),
      range('overlayBounce', '疊圖律動', 0, 0, 5, 0.5),
      toggle('enableColorKeying', '色度去背'),
      { ...text('overlayKeyColor', '去背顏色', '#000000'), type: 'color' },
      range('overlayKeyTolerance', '去背容差 (%)', 30, 0, 100),
    ],
  },
];

type ConfiguredField = (typeof settingGroups)[number]['fields'][number];
export type StudioSettings = {
  [Field in ConfiguredField as Field['key']]: Field['value'];
};

export function createSettings(): StudioSettings {
  return Object.fromEntries(
    settingGroups.flatMap((group) => group.fields.map((field) => [field.key, field.value])),
  ) as StudioSettings;
}

export const canvasSizes = {
  '16:9': [1920, 1080],
  '1:1': [1920, 1920],
  '9:16': [1080, 1920],
} as const;

export function getCanvasSize(aspectRatio: string): readonly [number, number] {
  return Object.hasOwn(canvasSizes, aspectRatio)
    ? canvasSizes[aspectRatio as keyof typeof canvasSizes]
    : canvasSizes['16:9'];
}
