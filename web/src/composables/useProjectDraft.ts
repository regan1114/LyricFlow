import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { ProjectData } from '../domain/project';
import {
  deleteDraft,
  DraftConflictError,
  loadDraft,
  readDraftState,
  saveDraft,
  type DraftSummary,
} from '../services/projectDraft';

interface DraftContext {
  capture: () => ProjectData;
  open: (data: ProjectData) => Promise<boolean>;
  blocked: () => boolean;
}
export function useProjectDraft(context: DraftContext) {
  const enabled = ref(true);
  try {
    enabled.value = localStorage.getItem('resonance-draft-autosave') !== 'off';
  } catch {
    /* Storage errors are reported when saving. */
  }
  const current = shallowRef<DraftSummary | null>(null);
  const ready = ref(false),
    dirty = ref(false),
    saving = ref(false),
    working = ref(false);
  const needsChoice = ref(false),
    error = ref('');
  let expected: string | null = null;
  let observed: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstChange = 0,
    suppress = false,
    disposed = false;
  let write: Promise<void> | undefined;
  let initializing: Promise<void> | undefined;
  const status = computed(() => {
    if (error.value) return error.value;
    if (!ready.value) return '正在檢查草稿…';
    if (working.value) return '正在處理草稿…';
    if (saving.value) return '正在儲存草稿…';
    if (needsChoice.value) return '請先選擇恢復草稿或保留目前作品。';
    if (!enabled.value)
      return dirty.value ? '自動儲存已暫停，有尚未儲存的變更。' : '自動儲存已暫停。';
    if (dirty.value) return '有變更，等待儲存…';
    return current.value ? '草稿已儲存' : '編輯後會自動儲存草稿。';
  });
  function cancelTimer() {
    clearTimeout(timer);
    timer = undefined;
    firstChange = 0;
  }
  async function handleError(cause: unknown) {
    if (cause instanceof DraftConflictError) {
      needsChoice.value = true;
      try {
        const state = await readDraftState();
        current.value = state.current;
        observed = state.revision;
      } catch {
        /* Keep the previous summary if unavailable. */
      }
      error.value = cause.message;
    } else {
      error.value =
        cause instanceof DOMException && cause.name === 'QuotaExceededError'
          ? '瀏覽器空間不足，草稿未更新。請下載專案備份，釋放空間後重試。'
          : `草稿未更新：${cause instanceof Error ? cause.message : '無法存取瀏覽器儲存空間'}。可先下載專案備份。`;
    }
  }
  function initialize(): Promise<void> {
    if (initializing) return initializing;
    initializing = (async () => {
      try {
        const state = await readDraftState();
        current.value = state.current;
        expected = observed = state.revision;
        needsChoice.value = !!current.value;
        ready.value = true;
        error.value = '';
        schedule();
      } catch (cause) {
        await handleError(cause);
      } finally {
        initializing = undefined;
      }
    })();
    return initializing;
  }
  function schedule() {
    if (
      disposed ||
      suppress ||
      !ready.value ||
      !enabled.value ||
      !dirty.value ||
      saving.value ||
      working.value ||
      needsChoice.value ||
      error.value ||
      context.blocked()
    )
      return;
    firstChange ||= Date.now();
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        cancelTimer();
        void flush();
      },
      Math.min(900, Math.max(0, 5000 - (Date.now() - firstChange))),
    );
  }
  function changed() {
    if (suppress || disposed) return;
    dirty.value = true;
    schedule();
  }
  async function flush() {
    if (
      disposed ||
      !ready.value ||
      !dirty.value ||
      working.value ||
      needsChoice.value ||
      error.value ||
      context.blocked()
    )
      return;
    if (write) {
      await write;
      return;
    }
    cancelTimer();
    dirty.value = false;
    saving.value = true;
    write = (async () => {
      try {
        current.value = await saveDraft(context.capture(), expected);
        expected = observed = current.value.revision;
      } catch (cause) {
        dirty.value = true;
        await handleError(cause);
      } finally {
        saving.value = false;
      }
    })();
    await write;
    write = undefined;
    schedule();
  }
  async function saveNow() {
    if (working.value || needsChoice.value || context.blocked()) return;
    if (!ready.value) {
      await initialize();
      if (!ready.value || needsChoice.value) return;
    }
    error.value = '';
    dirty.value = true;
    await flush();
  }
  async function restore() {
    if (!current.value || working.value || context.blocked()) return;
    if (dirty.value && !window.confirm('恢復草稿會替換目前的編輯內容，確定繼續？')) return;
    working.value = true;
    cancelTimer();
    suppress = true;
    try {
      const data = await loadDraft(current.value.revision);
      if (!(await context.open(data))) throw new Error('無法載入草稿素材，已保留目前作品');
      await nextTick();
      expected = observed = current.value.revision;
      dirty.value = false;
      needsChoice.value = false;
      error.value = '';
    } catch (cause) {
      await handleError(cause);
    } finally {
      suppress = false;
      working.value = false;
    }
  }
  async function useCurrent() {
    if (working.value || context.blocked()) return;
    if (current.value && !window.confirm('將以目前作品取代已儲存的草稿，確定繼續？')) return;
    expected = observed;
    needsChoice.value = false;
    error.value = '';
    dirty.value = true;
    await flush();
  }
  // Await an in-flight transaction before deletion so it cannot resurrect a cleared draft.
  async function clear() {
    if (working.value) return false;
    working.value = true;
    cancelTimer();
    try {
      if (!ready.value) {
        await initialize();
        if (!ready.value) return false;
      }
      const choiceRevision = needsChoice.value ? observed : expected;
      const hadChoice = needsChoice.value;
      if (write) await write;
      if (!hadChoice && needsChoice.value) throw new DraftConflictError();
      if (hadChoice) expected = choiceRevision;
      expected = observed = await deleteDraft(expected);
      current.value = null;
      dirty.value = false;
      needsChoice.value = false;
      error.value = '';
      return true;
    } catch (cause) {
      await handleError(cause);
      return false;
    } finally {
      working.value = false;
    }
  }
  async function remove() {
    if (
      context.blocked() ||
      working.value ||
      !window.confirm('刪除這個瀏覽器的草稿？目前編輯內容會保留，下一次編輯時會重新自動儲存。')
    )
      return;
    await clear();
  }
  watch(enabled, (value) => {
    try {
      localStorage.setItem('resonance-draft-autosave', value ? 'on' : 'off');
    } catch {
      /* Saving still reports storage errors. */
    }
    cancelTimer();
    if (value) schedule();
  });
  watch(context.blocked, (blocked) => {
    if (blocked) cancelTimer();
    else schedule();
  });
  const onVisibility = () => {
    if (document.visibilityState === 'hidden' && enabled.value) void flush();
  };
  onMounted(() => {
    void initialize();
    document.addEventListener('visibilitychange', onVisibility);
  });
  onBeforeUnmount(() => {
    disposed = true;
    cancelTimer();
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onVisibility);
  });
  return {
    enabled,
    current,
    dirty,
    saving,
    working,
    needsChoice,
    error,
    status,
    changed,
    saveNow,
    restore,
    useCurrent,
    clear,
    remove,
  };
}
