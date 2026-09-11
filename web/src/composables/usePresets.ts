import { computed, onMounted, ref } from 'vue';
import type { StudioSettings } from '../config/settings';
import type { SceneSettings } from '../config/scenes';
import { builtInPresets, contentKeys, type StylePreset } from '../config/presets';
import { validateSceneSettings, validateStudioSettings } from '../domain/project';
const storageKey = 'resonance-style-presets-v1';
export function usePresets(
  settings: StudioSettings,
  sceneSettings: SceneSettings,
  blocked: () => boolean,
  reportError: (message: string) => void,
) {
  const custom = ref<StylePreset[]>([]);
  const previous = ref<StylePreset | null>(null);
  const capture = (id: string, name: string): StylePreset => ({
    id,
    name,
    settings: { ...settings },
    sceneSettings: { ...sceneSettings },
  });
  function applyValues(preset: StylePreset) {
    const content = Object.fromEntries(contentKeys.map((key) => [key, settings[key]]));
    Object.assign(settings, preset.settings, content);
    Object.assign(sceneSettings, preset.sceneSettings);
  }
  function apply(id: string) {
    if (blocked()) return;
    const preset = [...builtInPresets, ...custom.value].find((item) => item.id === id);
    if (!preset) return;
    previous.value = capture('previous', '套用前');
    applyValues(preset);
  }
  function undo() {
    if (blocked() || !previous.value) return;
    applyValues(previous.value);
    previous.value = null;
  }
  function persist(next: StylePreset[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      custom.value = next;
      return true;
    } catch {
      reportError('無法儲存風格，請檢查瀏覽器儲存空間。');
      return false;
    }
  }
  function save(name: string) {
    if (blocked() || !name.trim()) return false;
    if (custom.value.length >= 30) {
      reportError('最多收藏 30 組風格，請先刪除不用的風格。');
      return false;
    }
    return persist([...custom.value, capture(crypto.randomUUID(), name.trim().slice(0, 60))]);
  }
  function remove(id: string) {
    if (!blocked()) persist(custom.value.filter((item) => item.id !== id));
  }
  onMounted(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(value) || value.length > 30) throw new Error();
      custom.value = value.map((item: StylePreset) => {
        if (!item || typeof item.id !== 'string' || typeof item.name !== 'string')
          throw new Error();
        return {
          id: item.id,
          name: item.name,
          settings: validateStudioSettings(item.settings),
          sceneSettings: validateSceneSettings(item.sceneSettings),
        };
      });
    } catch {
      reportError('無法讀取已收藏風格；內建風格仍可使用。');
    }
  });
  return {
    builtIn: builtInPresets,
    custom,
    apply,
    undo,
    save,
    remove,
    clearUndo: () => {
      previous.value = null;
    },
    canUndo: computed(() => previous.value !== null),
  };
}
