export const scenePresets = [
  { value: 'none', label: '無' },
  { value: 'custom', label: '自訂背景' },
  { value: 'aurora-fjord', label: '極光峽灣' },
  { value: 'nordic-cabin', label: '北歐暖爐木屋' },
  { value: 'hallstatt', label: '哈斯塔特湖畔' },
  { value: 'kyoto', label: '京都雨夜町屋' },
  { value: 'forest', label: '森林溪流木平台' },
] as const;

export type ScenePresetId = (typeof scenePresets)[number]['value'];
export type LandscapeId = Exclude<ScenePresetId, 'none' | 'custom'>;

export function createSceneSettings() {
  return {
    sceneAnimationEnabled: true,
    auroraFlowSpeed: 0.8,
    auroraBrightness: 100,
    auroraNaturalColor: true,
    cabinSnowSpeed: 0.8,
    cabinFireBrightness: 100,
    hallstattMode: 'day',
    hallstattDate: '2026-10-20',
    hallstattMoonPhase: 'date',
    hallstattProgress: 50,
    hallstattReflections: true,
    kyotoRainIntensity: 58,
    kyotoLampBrightness: 90,
    forestWaterSpeed: 0.8,
    forestDaylightBrightness: 100,
  };
}

export type SceneSettings = ReturnType<typeof createSceneSettings>;

export interface SceneSettingField {
  key: keyof SceneSettings;
  label: string;
  type: 'range' | 'select' | 'checkbox' | 'date';
  value: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string | number; label: string }[];
  suffix?: string;
}

const range = (
  key: keyof SceneSettings,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  suffix = '',
): SceneSettingField => ({ key, label, type: 'range', value, min, max, step, suffix });

export const sceneSettingFields: Partial<Record<ScenePresetId, SceneSettingField[]>> = {
  'aurora-fjord': [
    range('auroraFlowSpeed', '極光流速', 0.8, 0.2, 3, 0.1, 'x'),
    range('auroraBrightness', '極光亮度', 100, 25, 170, 5, '%'),
    { key: 'auroraNaturalColor', label: '自然變色', type: 'checkbox', value: true },
  ],
  'nordic-cabin': [
    range('cabinSnowSpeed', '飄雪速度', 0.8, 0.2, 3, 0.1, 'x'),
    range('cabinFireBrightness', '爐火亮度', 100, 25, 170, 5, '%'),
  ],
  hallstatt: [
    {
      key: 'hallstattMode',
      label: '日夜場景',
      type: 'select',
      value: 'day',
      options: [
        { value: 'day', label: '白天' },
        { value: 'night', label: '黑夜' },
      ],
    },
    { key: 'hallstattDate', label: '觀賞日期', type: 'date', value: '2026-10-20' },
    {
      key: 'hallstattMoonPhase',
      label: '月亮圓缺',
      type: 'select',
      value: 'date',
      options: [
        { value: 'date', label: '依日期呈現' },
        { value: '0', label: '新月' },
        { value: '90', label: '上弦月' },
        { value: '180', label: '滿月' },
        { value: '270', label: '下弦月' },
      ],
    },
    { key: 'hallstattReflections', label: '湖面倒影', type: 'checkbox', value: true },
    range('hallstattProgress', '日月時刻', 50, 0, 100, 0.1, '%'),
  ],
  kyoto: [
    range('kyotoRainIntensity', '庭院雨勢', 58, 0, 100, 1, '%'),
    range('kyotoLampBrightness', '暖燈亮度', 90, 0, 170, 5, '%'),
  ],
  forest: [
    range('forestWaterSpeed', '水流速度', 0.8, 0.2, 3, 0.1, 'x'),
    range('forestDaylightBrightness', '日光亮度', 100, 25, 170, 5, '%'),
  ],
};

export const sceneDefinitions: Record<
  LandscapeId,
  {
    name: string;
    url: string;
  }
> = {
  'aurora-fjord': {
    name: '極光峽灣',
    url: '/scenes/aurora-fjord.jpg',
  },
  'nordic-cabin': {
    name: '北歐暖爐木屋',
    url: '/scenes/nordic-cabin.jpg',
  },
  hallstatt: {
    name: '哈斯塔特湖畔',
    url: '/scenes/hallstatt.jpg',
  },
  kyoto: {
    name: '京都雨夜町屋',
    url: '/scenes/kyoto.jpg',
  },
  forest: {
    name: '森林溪流木平台',
    url: '/scenes/forest.jpg',
  },
};

export function isLandscapeId(value: unknown): value is LandscapeId {
  return typeof value === 'string' && Object.hasOwn(sceneDefinitions, value);
}
