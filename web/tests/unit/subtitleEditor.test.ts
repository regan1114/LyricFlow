import { afterEach, describe, expect, it } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import { useSubtitleEditor } from '../../src/composables/useSubtitleEditor';
import { parseSubtitles } from '../../src/domain/subtitles';
let scope: EffectScope;
afterEach(() => scope.stop());
function setup() {
  scope = effectScope();
  const raw = ref(
    '1\n00:00:01,000 --> 00:00:03,000\nFirst\n翻譯\n第三行\n第四行\n\n2\n00:00:05,000 --> 00:00:07,000\nSecond',
  );
  const blocked = ref(false);
  const editor = scope.run(() => useSubtitleEditor(raw, () => blocked.value))!;
  editor.selectedId.value = editor.items.value[0].uid;
  return { raw, blocked, editor };
}
describe('subtitle editor integration', () => {
  it('keeps plain and partially timed lyrics editable without a raw editor', () => {
    const { editor, raw } = setup();
    raw.value = 'First\nSecond\nThird';
    expect(editor.items.value.map((cue) => cue.text)).toEqual(['First', 'Second', 'Third']);
    editor.update(editor.items.value[0].uid, { text: 'Edited' });
    expect(parseSubtitles(raw.value).map((cue) => cue.text)).toEqual(['Edited', 'Second', 'Third']);
    raw.value = '[00:01.00] First\nSecond\nThird';
    expect(editor.items.value.map((cue) => cue.text)).toEqual(['First', 'Second', 'Third']);
    expect(editor.items.value[1].time).toBeGreaterThanOrEqual(editor.items.value[0].endTime);
  });
  it('pastes separate lyric rows within the original interval and supports undo', () => {
    const { editor, raw } = setup();
    const original = raw.value;
    editor.pasteLines(editor.items.value[0].uid, 'One\nTwo');
    expect(editor.items.value.map((cue) => cue.text)).toEqual(['One', 'Two', 'Second']);
    expect(editor.items.value[0]).toMatchObject({ time: 1, endTime: 2 });
    expect(editor.items.value[1]).toMatchObject({ time: 2, endTime: 3 });
    editor.undo();
    expect(raw.value).toBe(original);
  });

  it('preserves explicit ends, gaps and all text lines through edits and export', () => {
    const { editor, raw } = setup();
    editor.update(editor.selectedId.value!, { text: 'Edited' });
    const cues = parseSubtitles(raw.value);
    expect(cues[0]).toMatchObject({
      time: 1,
      endTime: 3,
      text: 'Edited',
      subText: '翻譯',
      thirdText: '第三行\n第四行',
    });
    expect(cues[1].time).toBe(5);
  });
  it('groups a drag into one undo and retains selection through sorting and redo', () => {
    const { editor, raw } = setup();
    const original = raw.value;
    const uid = editor.selectedId.value!;
    editor.begin();
    editor.update(uid, { time: 6, endTime: 8 });
    editor.update(uid, { time: 8, endTime: 10 });
    editor.commit();
    expect(editor.items.value[1].uid).toBe(uid);
    editor.undo();
    expect(raw.value).toBe(original);
    expect(editor.canUndo.value).toBe(false);
    editor.redo();
    expect(editor.selected.value?.time).toBe(8);
  });
  it('cancels a drag without adding history and rejects invalid timings', () => {
    const { editor, raw } = setup();
    const original = raw.value;
    expect(editor.update(editor.selectedId.value!, { time: -1 })).toBe(false);
    expect(editor.update(editor.selectedId.value!, { endTime: NaN })).toBe(false);
    expect(editor.update(editor.selectedId.value!, { endTime: 0 })).toBe(false);
    editor.begin();
    editor.update(editor.selectedId.value!, { endTime: 4 });
    editor.cancel();
    expect(raw.value).toBe(original);
    expect(editor.canUndo.value).toBe(false);
  });
  it('splits, duplicates and deletes with reversible selection', () => {
    const { editor } = setup();
    editor.split(2);
    expect(editor.items.value).toHaveLength(3);
    expect(editor.items.value[0].endTime).toBe(2);
    expect(editor.selected.value?.time).toBe(2);
    editor.duplicate();
    expect(editor.items.value).toHaveLength(4);
    editor.remove();
    expect(editor.items.value).toHaveLength(3);
    editor.undo();
    expect(editor.selected.value?.time).toBe(2.35);
  });
  it('uses literal search and replacement and blocks edits on locked or busy tracks', () => {
    const { editor, raw, blocked } = setup();
    editor.update(editor.selectedId.value!, { text: 'A.* a.*' });
    editor.search.value = 'a.*';
    editor.replacement.value = '$&';
    expect(editor.replaceAll()).toBe(2);
    expect(editor.selected.value?.text).toBe('$& $&');
    const original = raw.value;
    editor.locked.value = true;
    editor.remove();
    editor.add(0);
    editor.undo();
    expect(raw.value).toBe(original);
    editor.locked.value = false;
    blocked.value = true;
    editor.split(2);
    editor.duplicate();
    expect(raw.value).toBe(original);
  });
  it('undoes imported and raw lyrics without losing untimed text', () => {
    const { editor, raw } = setup();
    const original = raw.value;
    editor.begin();
    raw.value = '未對時';
    raw.value = '未對時歌詞';
    editor.commit();
    editor.undo();
    expect(raw.value).toBe(original);
    editor.redo();
    expect(raw.value).toBe('未對時歌詞');
    editor.add(0);
    editor.undo();
    expect(raw.value).toBe('未對時歌詞');
  });
});

describe('multiple subtitle selection', () => {
  it('does not publish new selection state when a stationary marquee selects the same cues', () => {
    const { editor } = setup();
    const ids = editor.items.value.map((cue) => cue.uid);
    editor.selectMany(ids);
    const selection = editor.selectedIds.value;
    for (let count = 0; count < 60; count++) editor.selectMany([...ids].reverse());
    expect(editor.selectedIds.value).toBe(selection);
  });
  it('moves a selected group with shared clamping and one undo step', () => {
    const { editor, raw } = setup();
    const original = raw.value;
    editor.selectMany(editor.items.value.map((cue) => cue.uid));
    const originals = editor.selectedItems.value.map((cue) => ({ ...cue }));
    editor.begin();
    editor.moveMany(originals, 2);
    editor.moveMany(originals, -10);
    editor.commit();
    expect(editor.items.value.map((cue) => cue.time)).toEqual([0, 4]);
    expect(editor.items.value.map((cue) => cue.endTime)).toEqual([2, 6]);
    expect(editor.selectedIds.value).toHaveLength(2);
    editor.undo();
    expect(raw.value).toBe(original);
    expect(editor.selectedIds.value).toHaveLength(2);
    expect(editor.canUndo.value).toBe(false);
    editor.redo();
    expect(editor.items.value.map((cue) => cue.time)).toEqual([0, 4]);
  });
  it('duplicates and removes the entire selection and restores it on undo', () => {
    const { editor } = setup();
    editor.selectMany(editor.items.value.map((cue) => cue.uid));
    editor.duplicate();
    expect(editor.items.value).toHaveLength(4);
    expect(editor.selectedItems.value.map((cue) => cue.time)).toEqual([1.35, 5.35]);
    editor.remove();
    expect(editor.items.value).toHaveLength(2);
    expect(editor.selectedIds.value).toEqual([]);
    editor.undo();
    expect(editor.selectedIds.value).toHaveLength(2);
    expect(editor.items.value).toHaveLength(4);
  });
  it('clears group selection on single selection and imports; blocks group edits when locked', () => {
    const { editor, raw } = setup();
    editor.selectMany(editor.items.value.map((cue) => cue.uid));
    const original = raw.value;
    editor.locked.value = true;
    editor.moveMany(editor.selectedItems.value, 3);
    editor.duplicate();
    editor.remove();
    expect(raw.value).toBe(original);
    editor.selectedId.value = editor.items.value[1].uid;
    expect(editor.selectedIds.value).toEqual([editor.items.value[1].uid]);
    raw.value = '新歌詞';
    expect(editor.selectedIds.value).toEqual([]);
  });
});
