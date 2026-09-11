import { afterEach, expect, it, vi } from 'vitest';
import { ref } from 'vue';

vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  onBeforeUnmount: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('static mode refuses recognition before making any request or replacing subtitles', async () => {
  vi.stubEnv('MODE', 'static');
  vi.resetModules();
  const { useAutoRecognition } = await import('../../src/composables/useAutoRecognition');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const busy = ref(false),
    apply = vi.fn();
  const recognition = useAutoRecognition(busy);
  expect(await recognition.start(new File(['audio'], 'song.wav'), '歌詞', [], apply)).toBe(false);
  await recognition.cancel();
  expect(fetcher).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  expect(busy.value).toBe(false);
  expect(recognition.error.value).toContain('此版本未提供自動辨識');
});
