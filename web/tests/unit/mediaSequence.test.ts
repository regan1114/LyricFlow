import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import { useMediaSequence } from '../../src/composables/useMediaSequence';
import { useSubtitleEditor } from '../../src/composables/useSubtitleEditor';
import { audioWindow, validateClip, type MediaClip } from '../../src/domain/mediaSequence';
import type { useMediaLibrary } from '../../src/composables/useMediaLibrary';
import type { AudioPlayer, PlaybackTimeline } from '../../src/composables/useAudioPlayer';
import type { RenderResources, RenderState } from '../../src/engine/resources';
vi.mock('vue', async (original) => {
  const vue = await original<typeof import('vue')>();
  return { ...vue, onBeforeUnmount: vue.onScopeDispose };
});
let scope: EffectScope;
afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
});
function setup(mode: 'manual' | 'auto' = 'manual') {
  scope = effectScope();
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      async decodeAudioData(data: ArrayBuffer) {
        return { duration: data.byteLength };
      }
    },
  );
  const resources = { cacheCanvases: { current: {} } } as unknown as RenderResources;
  const state = { current: { timelineVisual: null } as unknown as RenderState };
  const raw = ref('[00:00.50] linked\n[00:03.00] other');
  const editor = scope.run(() => useSubtitleEditor(raw, () => false))!;
  let timeline: PlaybackTimeline;
  const player = {
    pause: vi.fn(),
    setTimeline: vi.fn((value: PlaybackTimeline) => {
      timeline = value;
    }),
  } as unknown as AudioPlayer;
  const media = {
    loadVisual: async (file: File) => ({
      id: file.name,
      name: file.name,
      type: 'image',
      url: URL.createObjectURL(file),
      element: {},
    }),
  } as unknown as ReturnType<typeof useMediaLibrary>;
  const sequence = scope.run(() =>
    useMediaSequence(media, player, resources, state, editor, raw, () => false, vi.fn()),
  )!;
  sequence.setVisualMode(mode);
  return { sequence, editor, raw, state, timeline: () => timeline };
}
describe('media sequence', () => {
  it('shows the latest overlapping visual and preserves stable order for equal starts', async () => {
    const { sequence, timeline, state: renderState } = setup();
    await sequence.importFiles(
      [new File(['image'], 'first.png'), new File(['image'], 'second.png')],
      'visual',
    );
    sequence.add(sequence.assets.value[0].id, 'V1', 0);
    sequence.add(sequence.assets.value[1].id, 'V1', 1);
    await nextTick();
    const state = sequence.clips.value;
    // Playback sync must not sort or mutate the reactive clip list each frame.
    const order = state.map((clip) => clip.id);
    for (let index = 0; index < 60; index++) timeline().sync(2, false);
    expect(sequence.clips.value.map((clip) => clip.id)).toEqual(order);
    expect(renderState.current.timelineVisual?.name).toBe('second.png');
    sequence.update(sequence.clips.value[1].id, { start: 0 });
    await nextTick();
    timeline().sync(2, false);
    expect(sequence.clips.value[0].id).toBe(order[0]);
    expect(renderState.current.timelineVisual?.name).toBe('first.png');
  });
  it('locks and clears only the visual track in automatic mode, including clip history', async () => {
    const { sequence, raw } = setup();
    await sequence.importFiles([new File(['abcdefgh'], 'song.wav')], 'audio');
    await sequence.importFiles([new File(['image'], 'one.png')], 'visual');
    sequence.addAll();
    const subtitles = raw.value;
    expect(sequence.clips.value.map((clip) => clip.track)).toEqual(['A1', 'V1']);
    sequence.setVisualMode('auto');
    expect(sequence.visualLocked.value).toBe(true);
    expect(sequence.clips.value.map((clip) => clip.track)).toEqual(['A1']);
    expect(sequence.assets.value).toHaveLength(2);
    expect(raw.value).toBe(subtitles);
    sequence.add(sequence.assets.value[1].id);
    expect(sequence.clips.value).toHaveLength(1);
    sequence.undo();
    sequence.redo();
    expect(sequence.clips.value.every((clip) => clip.track !== 'V1')).toBe(true);
    sequence.add(sequence.assets.value[0].id, 'A2');
    expect(sequence.clips.value.map((clip) => clip.track)).toEqual(['A1', 'A2']);
    sequence.setVisualMode('manual');
    expect(sequence.visualLocked.value).toBe(false);
    expect(sequence.clips.value.every((clip) => clip.track !== 'V1')).toBe(true);
    sequence.add(sequence.assets.value[1].id);
    expect(sequence.selected.value?.track).toBe('V1');
  });
  it('keeps automatic image timing independent of timeline duration', async () => {
    const { sequence } = setup('auto');
    expect(sequence.visualMode.value).toBe('auto');
    expect(sequence.visualLocked.value).toBe(true);
    await sequence.importFiles(
      [new File(['image'], 'one.png'), new File(['image'], 'two.png')],
      'visual',
    );
    sequence.setVisualMode('auto');
    expect(sequence.duration.value).toBe(0);
    await sequence.importFiles([new File(['abcd'], 'song.wav')], 'audio');
    sequence.add(sequence.assets.value[2].id);
    expect(sequence.duration.value).toBe(4);
    sequence.setVisualMode('manual');
    expect(sequence.duration.value).toBe(4);
  });

  it('imports batches into the library, appends clips per track and preserves sources on clip deletion', async () => {
    const { sequence } = setup();
    await sequence.importFiles(
      [new File(['abcd'], 'one.wav'), new File(['abcdef'], 'two.wav')],
      'audio',
    );
    await sequence.importFiles(
      [new File(['image'], 'one.png'), new File(['image'], 'two.png')],
      'visual',
    );
    expect(sequence.assets.value).toHaveLength(4);
    expect(sequence.duration.value).toBe(0);
    sequence.addAll();
    await nextTick();
    expect(
      sequence.clips.value.filter((clip) => clip.track === 'A1').map((clip) => clip.start),
    ).toEqual([0, 4]);
    expect(
      sequence.clips.value.filter((clip) => clip.track === 'V1').map((clip) => clip.start),
    ).toEqual([0, 5]);
    expect(sequence.duration.value).toBe(10);
    sequence.remove();
    expect(sequence.assets.value).toHaveLength(4);
    sequence.undo();
    expect(sequence.clips.value).toHaveLength(4);
    sequence.add(sequence.assets.value[0].id, 'A2', 2);
    expect(sequence.selected.value?.track).toBe('A2');
  });
  it('preserves trim offsets when splitting and rejects source overruns', async () => {
    const { sequence } = setup();
    await sequence.importFiles([new File(['abcdefgh'], 'song.wav')], 'audio');
    sequence.addAll();
    const clip = sequence.selected.value!;
    expect(sequence.update(clip.id, { trimStart: 2, duration: 4 })).toBe(true);
    sequence.split(1.5);
    expect(sequence.selected.value).toMatchObject({ start: 1.5, trimStart: 3.5, duration: 2.5 });
    expect(sequence.update(sequence.selectedId.value!, { duration: 9 })).toBe(false);
    sequence.undo();
    expect(sequence.clips.value).toHaveLength(1);
  });
  it('does not rewind independent subtitle changes when undoing an unlinked clip edit', async () => {
    const { sequence, raw } = setup();
    await sequence.importFiles([new File(['image'], 'image.png')], 'visual');
    sequence.addAll();
    sequence.update(sequence.selectedId.value!, { start: 1 });
    raw.value = '[00:04.00] new caption';
    sequence.undo();
    expect(raw.value).toBe('[00:04.00] new caption');
  });
  it('links only the original cues during a move and restores them on undo', async () => {
    const { sequence, editor } = setup();
    await sequence.importFiles([new File(['ab'], 'song.wav')], 'audio');
    sequence.addAll();
    sequence.linkSubtitles.value = true;
    sequence.begin();
    sequence.update(sequence.selectedId.value!, { start: 1 });
    sequence.update(sequence.selectedId.value!, { start: 2 });
    sequence.commit();
    expect(editor.items.value.map((cue) => cue.time)).toEqual([2.5, 3]);
    sequence.undo();
    expect(editor.items.value.map((cue) => cue.time)).toEqual([0.5, 3]);
  });
  it('schedules overlapping audio into one output with source offsets and per-clip gains', async () => {
    const { sequence, timeline } = setup();
    await sequence.importFiles([new File(['abcdefgh'], 'song.wav')], 'audio');
    sequence.addAll();
    sequence.update(sequence.selectedId.value!, { trimStart: 2, duration: 4, volume: 0.5 });
    sequence.add(sequence.assets.value[0].id, 'A2', 2);
    await nextTick();
    const sources: {
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    const gains: {
      gain: { value: number };
      connect: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    const context = {
      createBufferSource: () => {
        const node = { start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn() };
        sources.push(node);
        return node;
      },
      createGain: () => {
        const node = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
        gains.push(node);
        return node;
      },
    } as unknown as AudioContext;
    const output = {} as AudioNode;
    const stop = timeline().schedule(context, output, 1, 20);
    expect(sources[0].start).toHaveBeenCalledWith(20, 3, 3);
    expect(sources[1].start).toHaveBeenCalledWith(21, 0, 8);
    expect(gains[0].gain.value).toBe(0.5);
    expect(gains[1].connect).toHaveBeenCalledWith(output);
    stop();
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(gains[1].disconnect).toHaveBeenCalledOnce();
  });
  it('computes audio windows and validates media-only duration boundaries', () => {
    setup();
    const clip: MediaClip = {
      id: 'a',
      assetId: 'a',
      track: 'A1',
      start: 3,
      duration: 4,
      trimStart: 2,
      volume: 1,
      muted: false,
    };
    expect(audioWindow(clip, 5)).toEqual({ delay: 0, offset: 4, duration: 2 });
    expect(validateClip(clip, 'audio', 6)).toBe(true);
    expect(validateClip({ ...clip, duration: 5 }, 'audio', 6)).toBe(false);
    expect(validateClip({ ...clip, duration: 500, track: 'V1', trimStart: 0 }, 'image', 5)).toBe(
      true,
    );
  });
});
