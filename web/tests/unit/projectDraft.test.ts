import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import { useProjectDraft } from '../../src/composables/useProjectDraft';
import {
  deleteDraft,
  readDraftState,
  saveDraft,
  type DraftSummary,
} from '../../src/services/projectDraft';
import type { ProjectData } from '../../src/domain/project';

const hooks = vi.hoisted(() => ({ mounted: [] as (() => void)[] }));
vi.mock('vue', async (original) => {
  const vue = await original<typeof import('vue')>();
  return {
    ...vue,
    onMounted: (callback: () => void) => hooks.mounted.push(callback),
    onBeforeUnmount: vue.onScopeDispose,
  };
});
vi.mock('../../src/services/projectDraft', async (original) => ({
  ...(await original<typeof import('../../src/services/projectDraft')>()),
  readDraftState: vi.fn(),
  saveDraft: vi.fn(),
  deleteDraft: vi.fn(),
  loadDraft: vi.fn(),
}));
const saved: DraftSummary = {
  revision: 'saved',
  savedAt: 1,
  name: 'song',
  bytes: 0,
  mediaCount: 0,
};
let scope: EffectScope;
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  hooks.mounted = [];
  scope = effectScope();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('window', { confirm: vi.fn(() => true) });
  vi.mocked(readDraftState).mockResolvedValue({ current: null, revision: null });
  vi.mocked(saveDraft).mockResolvedValue(saved);
  vi.mocked(deleteDraft).mockResolvedValue('00000000-0000-0000-0000-000000000001');
});
afterEach(() => {
  scope.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function setup() {
  const blocked = ref(false);
  const data = { manifest: { lyrics: 'one' }, files: [] } as unknown as ProjectData;
  const capture = vi.fn(() => structuredClone(data));
  const draft = scope.run(() =>
    useProjectDraft({ capture, open: async () => true, blocked: () => blocked.value }),
  )!;
  hooks.mounted.forEach((callback) => callback());
  await vi.advanceTimersByTimeAsync(0);
  return { draft, blocked, data, capture };
}
it('coalesces changes and waits for media operations before capturing the latest state', async () => {
  const { draft, blocked, data } = await setup();
  await vi.advanceTimersByTimeAsync(2000);
  expect(saveDraft).not.toHaveBeenCalled();
  blocked.value = true;
  await nextTick();
  draft.changed();
  data.manifest.lyrics = 'latest';
  draft.changed();
  await vi.advanceTimersByTimeAsync(2000);
  expect(saveDraft).not.toHaveBeenCalled();
  blocked.value = false;
  await nextTick();
  await vi.advanceTimersByTimeAsync(900);
  expect(saveDraft).toHaveBeenCalledOnce();
  expect(vi.mocked(saveDraft).mock.calls[0][0].manifest.lyrics).toBe('latest');
});
it('clearing waits for the active write and discards queued changes', async () => {
  const { draft } = await setup();
  let finish!: (value: DraftSummary) => void;
  vi.mocked(saveDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  draft.changed();
  await vi.advanceTimersByTimeAsync(900);
  draft.changed();
  const clearing = draft.clear();
  expect(deleteDraft).not.toHaveBeenCalled();
  finish(saved);
  expect(await clearing).toBe(true);
  expect(deleteDraft).toHaveBeenCalledWith('saved');
  await vi.advanceTimersByTimeAsync(6000);
  expect(saveDraft).toHaveBeenCalledOnce();
  expect(draft.current.value).toBeNull();
});
it('continuing edits during a slow save cause one subsequent save with the newest content', async () => {
  const { draft, data } = await setup();
  let finish!: (value: DraftSummary) => void;
  vi.mocked(saveDraft).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  draft.changed();
  await vi.advanceTimersByTimeAsync(900);
  data.manifest.lyrics = 'two';
  draft.changed();
  data.manifest.lyrics = 'three';
  draft.changed();
  finish(saved);
  await vi.advanceTimersByTimeAsync(900);
  expect(saveDraft).toHaveBeenCalledTimes(2);
  expect(vi.mocked(saveDraft).mock.calls[1][0].manifest.lyrics).toBe('three');
});
it('existing drafts block automatic replacement even when the user edits before deciding', async () => {
  vi.mocked(readDraftState).mockResolvedValue({ current: saved, revision: saved.revision });
  const { draft } = await setup();
  draft.changed();
  await vi.advanceTimersByTimeAsync(6000);
  expect(saveDraft).not.toHaveBeenCalled();
  vi.mocked(window.confirm).mockReturnValueOnce(false);
  await draft.useCurrent();
  expect(saveDraft).not.toHaveBeenCalled();
  await draft.useCurrent();
  expect(saveDraft).toHaveBeenCalledWith(expect.anything(), 'saved');
});
