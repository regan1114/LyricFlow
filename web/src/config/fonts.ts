export interface BundledFont {
  label: string;
  value: string;
  file: string;
  weight: string;
  preview: string;
}

export const bundledFonts: BundledFont[] = [
  {
    label: '思源黑體 TC',
    value: 'Signal Noto Sans TC',
    file: 'notosanstc',
    weight: '100 900',
    preview: '清楚俐落',
  },
  {
    label: '思源宋體 TC',
    value: 'Signal Noto Serif TC',
    file: 'notoseriftc',
    weight: '200 900',
    preview: '典雅端正',
  },
  {
    label: '昭源黑體',
    value: 'Signal Chiron Hei HK',
    file: 'chironheihk',
    weight: '200 900',
    preview: '穩重清晰',
  },
  {
    label: '昭源宋體',
    value: 'Signal Chiron Sung HK',
    file: 'chironsunghk',
    weight: '200 900',
    preview: '書卷氣息',
  },
  {
    label: '粉圓 Huninn',
    value: 'Signal Huninn',
    file: 'huninn',
    weight: '400',
    preview: '圓潤親切',
  },
  {
    label: '霞鶩文楷 TC',
    value: 'Signal LXGW WenKai TC',
    file: 'lxgwwenkaitc',
    weight: '400',
    preview: '溫柔文藝',
  },
  {
    label: '芫荽 Iansui',
    value: 'Signal Iansui',
    file: 'iansui',
    weight: '400',
    preview: '自然手寫',
  },
  {
    label: '辰宇落雁體',
    value: 'Signal ChenYuluoyan',
    file: 'chenyu',
    weight: '400',
    preview: '纖細輕盈',
  },
  {
    label: '清松手寫體 1',
    value: 'Signal Jason Handwriting 1',
    file: 'jason1',
    weight: '400',
    preview: '圓潤手寫',
  },
  {
    label: '清松手寫體 4',
    value: 'Signal Jason Handwriting 4',
    file: 'jason4',
    weight: '400',
    preview: '活潑標語',
  },
  {
    label: '清松手寫體 5',
    value: 'Signal Jason Handwriting 5',
    file: 'jason5',
    weight: '400',
    preview: '行楷筆意',
  },
  {
    label: '莫大毛筆・標準',
    value: 'Signal Bakudai Regular',
    file: 'bakudai-regular',
    weight: '400',
    preview: '厚實筆韻',
  },
  {
    label: '莫大毛筆・粗體',
    value: 'Signal Bakudai Bold',
    file: 'bakudai-bold',
    weight: '700',
    preview: '濃墨厚筆',
  },
  {
    label: '正風毛筆・標準',
    value: 'Signal Masa Font Regular',
    file: 'masafont-regular',
    weight: '400',
    preview: '行書流韻',
  },
  {
    label: '正風毛筆・粗體',
    value: 'Signal Masa Font Bold',
    file: 'masafont-bold',
    weight: '700',
    preview: '豪放行書',
  },
];

const fontRequests = new Map<string, Promise<void>>();

export function ensureFontLoaded(fontFamily: string): Promise<void> {
  const font = bundledFonts.find((candidate) => candidate.value === fontFamily);
  if (!font || typeof FontFace === 'undefined') return Promise.resolve();
  const existing = fontRequests.get(font.value);
  if (existing) return existing;
  const request = new FontFace(font.value, `url("/fonts/${font.file}.woff2") format("woff2")`, {
    weight: font.weight,
    style: 'normal',
    display: 'swap',
  })
    .load()
    .then((face) => {
      document.fonts.add(face);
    })
    .catch((error) => {
      fontRequests.delete(font.value);
      throw error;
    });
  fontRequests.set(font.value, request);
  return request;
}

export const fontOptions = [
  ...bundledFonts.map((font) => ({ label: `內建 - ${font.label}`, value: font.value })),
  { label: '本機字型', value: 'custom' },
];
