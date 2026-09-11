import { computed, ref, watch, type Ref } from 'vue';
import {
  getUntimedLines,
  parseSubtitles,
  serializeSrt,
  type SubtitleCue,
} from '../domain/subtitles';

// Third-party notices for subtitle editing: see public/THIRD-PARTY-LICENSES.
export function useSubtitleEditor(raw: Ref<string>, blocked: () => boolean) {
  function readLines(value: string): SubtitleCue[] {
    const timed = parseSubtitles(value);
    if (value.includes('-->')) return timed;
    const pending = value
      .split(/\r?\n/)
      .filter((line) => !/\[\d+:[0-5]\d(?:\.\d{1,3})?\]/.test(line))
      .join('\n');
    const start = timed.reduce((end, cue) => Math.max(end, cue.endTime), 0);
    return [
      ...timed,
      ...getUntimedLines(pending).map((text, index) => ({
        uid: crypto.randomUUID(),
        time: start + index * 3,
        endTime: start + (index + 1) * 3,
        text,
        subText: '',
        thirdText: '',
        animType: index % 12,
      })),
    ];
  }
  const items = ref<SubtitleCue[]>(readLines(raw.value));
  const selectedIds = ref<string[]>([]);
  const selectedSet = computed(() => new Set(selectedIds.value));
  const selectedId = computed<string | null>({
    get: () => selectedIds.value[0] ?? null,
    set: (uid) => {
      selectedIds.value = uid ? [uid] : [];
    },
  });
  const selectedItems = computed(() => items.value.filter((cue) => selectedSet.value.has(cue.uid)));
  function selectMany(ids: string[]) {
    const requested = new Set(ids);
    const next = items.value.filter((cue) => requested.has(cue.uid)).map((cue) => cue.uid);
    if (
      next.length !== selectedIds.value.length ||
      next.some((uid, index) => uid !== selectedIds.value[index])
    )
      selectedIds.value = next;
  }
  const locked = ref(false);
  const snapping = ref(true);
  const search = ref('');
  const replacement = ref('');
  const selected = computed(() => items.value.find((cue) => cue.uid === selectedId.value));
  const disabled = computed(() => locked.value || blocked());
  const visible = computed(() =>
    items.value.filter((cue) =>
      [cue.text, cue.subText, cue.thirdText]
        .join('\n')
        .toLowerCase()
        .includes(search.value.toLowerCase()),
    ),
  );
  type Snapshot = { raw: string; items: SubtitleCue[]; selectedIds: string[] };
  const undoStack = ref<Snapshot[]>([]);
  const redoStack = ref<Snapshot[]>([]);
  let transaction: Snapshot | null = null;
  let writing = false;
  const snapshot = (): Snapshot => ({
    raw: raw.value,
    items: items.value.map((cue) => ({ ...cue })),
    selectedIds: [...selectedIds.value],
  });
  function remember(value: Snapshot) {
    undoStack.value = [...undoStack.value.slice(-99), value];
    redoStack.value = [];
  }
  function begin() {
    if (!disabled.value && !transaction) transaction = snapshot();
  }
  function commit() {
    if (transaction && transaction.raw !== raw.value) remember(transaction);
    transaction = null;
  }
  function restore(value: Snapshot) {
    writing = true;
    raw.value = value.raw;
    writing = false;
    items.value = value.items.map((cue) => ({ ...cue }));
    selectedIds.value = [...value.selectedIds];
  }
  function cancel() {
    if (transaction) restore(transaction);
    transaction = null;
  }
  function write(next: SubtitleCue[], selection: string | string[] | null = selectedIds.value) {
    if (disabled.value) return;
    if (!transaction) remember(snapshot());
    items.value = next.slice().sort((first, second) => first.time - second.time);
    selectMany(typeof selection === 'string' ? [selection] : (selection ?? []));
    writing = true;
    raw.value = serializeSrt(items.value);
    writing = false;
  }
  watch(
    raw,
    (value, previous) => {
      if (writing) return;
      if (!transaction) remember({ ...snapshot(), raw: previous });
      items.value = readLines(value);
      selectedId.value = null;
    },
    { flush: 'sync' },
  );
  function update(
    uid: string,
    patch: Partial<Pick<SubtitleCue, 'time' | 'endTime' | 'text' | 'subText' | 'thirdText'>>,
  ) {
    const cue = items.value.find((item) => item.uid === uid);
    if (!cue || disabled.value) return false;
    const next = { ...cue, ...patch };
    if (
      !Number.isFinite(next.time) ||
      !Number.isFinite(next.endTime) ||
      next.time < 0 ||
      next.endTime - next.time < 0.05
    )
      return false;
    write(items.value.map((item) => (item.uid === uid ? next : item)));
    return true;
  }
  function add(time: number) {
    if (disabled.value) return;
    const cue: SubtitleCue = {
      uid: crypto.randomUUID(),
      time: Math.max(0, time),
      endTime: Math.max(0, time) + 3,
      text: '新增字幕',
      subText: '',
      thirdText: '',
      animType: 0,
    };
    write([...items.value, cue], cue.uid);
  }
  function pasteLines(uid: string, text: string) {
    if (disabled.value) return;
    const index = items.value.findIndex((cue) => cue.uid === uid);
    if (index < 0) return;
    const lines = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((line) => line.trim());
    if (!lines.length) return;
    const original = items.value[index];
    const length = Math.max(0.05, (original.endTime - original.time) / lines.length);
    const inserted = lines.map((line, offset) => ({
      ...original,
      uid: offset === 0 ? uid : crypto.randomUUID(),
      text: line,
      subText: '',
      thirdText: '',
      time: original.time + offset * length,
      endTime: original.time + (offset + 1) * length,
    }));
    write([...items.value.slice(0, index), ...inserted, ...items.value.slice(index + 1)], uid);
  }
  function moveMany(originals: SubtitleCue[], delta: number) {
    if (!originals.length || disabled.value || !Number.isFinite(delta)) return;
    const offset = Math.max(delta, -Math.min(...originals.map((cue) => cue.time)));
    const moved = new Map(
      originals.map((cue) => [
        cue.uid,
        {
          ...cue,
          time: Math.round((cue.time + offset) * 1000) / 1000,
          endTime: Math.round((cue.endTime + offset) * 1000) / 1000,
        },
      ]),
    );
    write(items.value.map((cue) => moved.get(cue.uid) ?? cue));
  }
  function remove() {
    if (selectedItems.value.length)
      write(
        items.value.filter((cue) => !selectedSet.value.has(cue.uid)),
        null,
      );
  }
  function duplicate() {
    if (!selectedItems.value.length) return;
    const copies = selectedItems.value.map((cue) => ({
      ...cue,
      uid: crypto.randomUUID(),
      time: cue.time + 0.35,
      endTime: cue.endTime + 0.35,
    }));
    write(
      [...items.value, ...copies],
      copies.map((cue) => cue.uid),
    );
  }
  function split(time: number) {
    const cue = selected.value;
    if (
      selectedItems.value.length !== 1 ||
      !cue ||
      time - cue.time < 0.05 ||
      cue.endTime - time < 0.05
    )
      return;
    const right = { ...cue, uid: crypto.randomUUID(), time };
    write(
      [
        ...items.value.map((item) => (item.uid === cue.uid ? { ...item, endTime: time } : item)),
        right,
      ],
      right.uid,
    );
  }
  function replaceAll() {
    if (!search.value || disabled.value) return 0;
    const expression = new RegExp(search.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let count = 0;
    const replace = (text: string) =>
      text.replace(expression, () => {
        count++;
        return replacement.value;
      });
    const next = items.value.map((cue) => ({
      ...cue,
      text: replace(cue.text),
      subText: replace(cue.subText),
      thirdText: replace(cue.thirdText),
    }));
    if (count) write(next);
    return count;
  }
  function undo() {
    if (disabled.value) return;
    commit();
    const previous = undoStack.value.pop();
    if (previous) {
      redoStack.value.push(snapshot());
      restore(previous);
    }
  }
  function redo() {
    if (disabled.value) return;
    const next = redoStack.value.pop();
    if (next) {
      undoStack.value.push(snapshot());
      restore(next);
    }
  }
  function resetHistory() {
    undoStack.value = [];
    redoStack.value = [];
    transaction = null;
    selectedId.value = null;
    search.value = '';
    replacement.value = '';
  }
  return {
    resetHistory,
    items,
    selectedId,
    selectedIds,
    selectedSet,
    selectedItems,
    selectMany,
    moveMany,
    selected,
    locked,
    snapping,
    search,
    replacement,
    visible,
    disabled,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    begin,
    commit,
    cancel,
    update,
    add,
    pasteLines,
    remove,
    duplicate,
    split,
    replaceAll,
    undo,
    redo,
  };
}
