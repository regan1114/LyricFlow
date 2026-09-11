import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import { createStudio } from '../../src/composables/useStudio';
import { useRecording } from '../../src/composables/useRecording';
import type { AudioPlayer } from '../../src/composables/useAudioPlayer';
import { createSettings } from '../../src/config/settings';
import { createRenderResources, createRenderState } from '../../src/engine/resources';
import { ensureFontLoaded } from '../../src/config/fonts';
import { downloadBlob } from '../../src/services/download';
import { RecordingBuffer } from '../../src/services/recordingBuffer';

vi.mock('vue', async (original) => {
  const vue = await original<typeof import('vue')>();
  return { ...vue, onBeforeUnmount: vue.onScopeDispose };
});
vi.mock('../../src/config/fonts', () => ({
  fontOptions: [{ value: 'test', label: 'Test' }],
  ensureFontLoaded: vi.fn(),
}));
vi.mock('../../src/services/download', () => ({ downloadBlob: vi.fn(), downloadText: vi.fn() }));

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Value>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

class FakeImage extends EventTarget {
  static pending: FakeImage[] = [];
  src = '';
  complete = true;
  width = 640;
  height = 360;
  constructor() {
    super();
    FakeImage.pending.push(this);
  }
}
class FakeAudio extends EventTarget {
  currentTime = 0;
  duration = 10;
  paused = true;
  src = '';
  load = vi.fn(() => this.dispatchEvent(new Event('loadedmetadata')));
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  });
  removeAttribute() {}
}
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported() {
    return true;
  }
  state: RecordingState = 'inactive';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor() {
    FakeRecorder.instances.push(this);
  }
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['final']) });
      this.onstop?.();
    });
  });
}

let scope: EffectScope;
beforeEach(() => {
  scope = effectScope();
  vi.clearAllMocks();
  FakeImage.pending = [];
  FakeRecorder.instances = [];
  vi.stubGlobal('window', Object.assign(new EventTarget(), { MediaRecorder: FakeRecorder }));
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('HTMLVideoElement', class {});
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.mocked(ensureFontLoaded).mockResolvedValue(undefined);
});
afterEach(() => {
  scope.stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('media loading lifecycle', () => {
  it('does not start playback after pause cancels a pending audio resume', async () => {
    const studio = scope.run(createStudio)!;
    const resume = deferred<void>();
    studio.resources.audioContextRef.current = {
      resume: () => resume.promise,
      close: async () => {},
    } as unknown as AudioContext;
    studio.media.setAudio(new File(['audio'], 'song.wav'));
    await nextTick();
    const pending = studio.player.play();
    studio.player.pause();
    resume.resolve();
    await pending;
    expect(studio.resources.audioRef.current!.play).not.toHaveBeenCalled();
    expect(studio.player.isPlaying.value).toBe(false);
  });

  it('cancels a pending built-in load when custom mode is selected', async () => {
    const studio = scope.run(createStudio)!;
    studio.settings.scenePreset = 'forest';
    studio.settings.scenePreset = 'custom';
    FakeImage.pending[0].dispatchEvent(new Event('load'));
    await nextTick();
    await nextTick();
    expect(studio.settings.scenePreset).toBe('custom');
    expect(studio.media.backgrounds.value).toHaveLength(0);
  });

  it('preserves a built-in scene after an invalid import', async () => {
    const studio = scope.run(createStudio)!;
    studio.settings.scenePreset = 'kyoto';
    await nextTick();
    FakeImage.pending[0].dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(studio.media.backgrounds.value).toHaveLength(1));
    const pending = studio.importFiles('background', [
      new File(['bad'], 'broken.png', { type: 'image/png' }),
    ]);
    await nextTick();
    FakeImage.pending[1].dispatchEvent(new Event('error'));
    await pending;
    expect(studio.settings.scenePreset).toBe('kyoto');
    expect(studio.media.backgrounds.value[0].url).toBe('/scenes/kyoto.jpg');
    expect(studio.error.value).toContain('broken.png');
  });

  it('does not let an older import overwrite a newer scene selection', async () => {
    const studio = scope.run(createStudio)!;
    const pending = studio.importFiles('background', [
      new File(['image'], 'slow.png', { type: 'image/png' }),
    ]);
    await nextTick();
    studio.settings.scenePreset = 'forest';
    await nextTick();
    FakeImage.pending[1].dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(studio.media.backgrounds.value).toHaveLength(1));
    FakeImage.pending[0].dispatchEvent(new Event('load'));
    await pending;
    expect(studio.settings.scenePreset).toBe('forest');
    expect(studio.media.backgrounds.value[0].url).toBe('/scenes/forest.jpg');
  });

  it('keeps imported visuals in the library until added to the timeline', async () => {
    const studio = scope.run(createStudio)!;
    studio.sequence.setVisualMode('manual');
    const pending = studio.importFiles('background', [
      new File(['image'], 'image.png', { type: 'image/png' }),
    ]);
    expect(studio.settings.scenePreset).toBe('none');
    await nextTick();
    FakeImage.pending[0].dispatchEvent(new Event('load'));
    await pending;
    expect(studio.settings.scenePreset).toBe('none');
    expect(studio.sequence.assets.value).toHaveLength(1);
    expect(studio.sequence.clips.value).toHaveLength(0);
    studio.sequence.addAll();
    await nextTick();
    expect(studio.player.duration.value).toBe(5);
    expect(studio.renderState.current.timelineVisual?.name).toBe('image.png');
  });
});

function recordingHarness() {
  const resources = createRenderResources();
  const settings = createSettings();
  settings.selectedFont = 'custom';
  const stopTrack = vi.fn();
  const destination = { stream: { getAudioTracks: () => [], getTracks: () => [] } };
  resources.canvasRef.current = {
    width: 1920,
    height: 1080,
    captureStream: () => ({ getTracks: () => [{ stop: stopTrack }], addTrack() {} }),
  } as unknown as HTMLCanvasElement;
  resources.audioContextRef.current = {
    createMediaStreamDestination: () => destination,
  } as unknown as AudioContext;
  resources.sourceRef.current = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as MediaElementAudioSourceNode;
  const player: AudioPlayer = {
    isPlaying: ref(false),
    currentTime: ref(0),
    duration: ref(10),
    volume: ref(0.8),
    isLoaded: ref(true),
    initAudio: vi.fn(async () => {}),
    load: vi.fn(),
    setTimeline: vi.fn(),
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    toggle: vi.fn(async () => {}),
    seek: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
  };
  const reportError = vi.fn();
  const recording = scope.run(() =>
    useRecording(
      resources,
      { current: createRenderState(settings) },
      player,
      settings,
      reportError,
    ),
  )!;
  return { recording, player, settings, reportError, stopTrack, resources };
}

describe('recording lifecycle', () => {
  it('releases the captured canvas stream when audio destination creation fails', async () => {
    const { recording, resources, stopTrack, reportError } = recordingHarness();
    vi.spyOn(resources.audioContextRef.current!, 'createMediaStreamDestination').mockImplementation(
      () => {
        throw new Error('destination failed');
      },
    );
    await recording.start();
    expect(recording.status.value).toBe('idle');
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith('destination failed');
  });

  it('does not start a recorder after its owner is disposed', async () => {
    const { recording, player } = recordingHarness();
    const initialization = deferred<void>();
    vi.mocked(player.initAudio).mockReturnValue(initialization.promise);
    const pending = recording.start();
    scope.stop();
    initialization.resolve();
    await pending;
    expect(FakeRecorder.instances).toHaveLength(0);
    expect(recording.status.value).toBe('idle');
  });

  it('releases an active stream on disposal without downloading', async () => {
    const { recording, stopTrack } = recordingHarness();
    await recording.start();
    scope.stop();
    await nextTick();
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('cancels while waiting for audio initialization', async () => {
    const { recording, player } = recordingHarness();
    const initialization = deferred<void>();
    vi.mocked(player.initAudio).mockReturnValue(initialization.promise);
    const pending = recording.start();
    expect(recording.status.value).toBe('preparing');
    recording.stop();
    expect(recording.status.value).toBe('idle');
    initialization.resolve();
    await pending;
    expect(FakeRecorder.instances).toHaveLength(0);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('cancels font loading and ignores a stale rejection after another recording starts', async () => {
    const { recording, player, settings, reportError } = recordingHarness();
    const font = deferred<void>();
    settings.selectedFont = 'test';
    vi.mocked(ensureFontLoaded).mockReturnValueOnce(font.promise);
    const pending = recording.start();
    recording.stop();
    settings.selectedFont = 'custom';
    await recording.start();
    font.reject(new Error('stale font failure'));
    await pending;
    expect(recording.status.value).toBe('recording');
    expect(player.initAudio).toHaveBeenCalledTimes(1);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('waits for the final chunk before unlocking and exports once', async () => {
    const { recording, stopTrack } = recordingHarness();
    await recording.start();
    recording.stop();
    expect(recording.status.value).toBe('stopping');
    const restart = recording.start();
    expect(FakeRecorder.instances).toHaveLength(1);
    await restart;
    expect(recording.status.value).toBe('idle');
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(await vi.mocked(downloadBlob).mock.calls[0][0].text()).toBe('final');
  });

  it('stops at the buffer limit and includes the final chunk', async () => {
    const { recording, reportError } = recordingHarness();
    vi.spyOn(RecordingBuffer.prototype, 'append').mockImplementation(function (
      this: RecordingBuffer,
      chunk: Blob,
    ) {
      Object.defineProperty(this, 'limit', { value: 4, configurable: true });
      return originalAppend.call(this, chunk);
    });
    await recording.start();
    FakeRecorder.instances[0].ondataavailable?.({ data: new Blob(['abcd']) });
    expect(recording.status.value).toBe('stopping');
    await nextTick();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(await vi.mocked(downloadBlob).mock.calls[0][0].text()).toBe('abcdfinal');
  });

  it('cleans up a playback failure without downloading an incomplete recording', async () => {
    const { recording, player, reportError, stopTrack } = recordingHarness();
    vi.mocked(player.play).mockRejectedValue(new Error('playback failed'));
    await recording.start();
    await nextTick();
    expect(recording.status.value).toBe('idle');
    expect(reportError).toHaveBeenCalledWith('playback failed');
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});

const originalAppend = RecordingBuffer.prototype.append;
