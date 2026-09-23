import { describe, expect, it, vi } from 'vitest';
import { MAX_RECORDING_BYTES } from '../../src/services/recordingBuffer';
import { RecordingFile } from '../../src/services/recordingFile';

function harness() {
  const stream = {
    write: vi.fn(async (_chunk: Blob) => {}),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
  };
  const onError = vi.fn();
  const file = new RecordingFile(stream as unknown as FileSystemWritableFileStream, onError);
  return { file, stream, onError };
}

describe('recording file streaming', () => {
  it('allows total output beyond 256 MiB while completed writes release queued memory', async () => {
    const { file, stream } = harness();
    // Model large encoded chunks without allocating hundreds of MiB in the test runner.
    const chunk = new Blob(['chunk']);
    Object.defineProperty(chunk, 'size', { value: MAX_RECORDING_BYTES / 2 });
    for (let index = 0; index < 3; index++) {
      expect(file.append(chunk)).toBe(false);
      await vi.waitFor(() => expect(stream.write).toHaveBeenCalledTimes(index + 1));
    }
    expect(file.bytes).toBe(MAX_RECORDING_BYTES * 1.5);
    await file.finish();
    expect(stream.close).toHaveBeenCalledTimes(1);
    expect(stream.abort).not.toHaveBeenCalled();
  });

  it('writes chunks in order and waits for the final write before closing once', async () => {
    const { file, stream } = harness();
    let complete!: () => void;
    stream.write.mockImplementationOnce(() => new Promise<void>((resolve) => (complete = resolve)));
    const first = new Blob(['first']);
    const final = new Blob(['final']);
    file.append(first);
    file.append(final);
    const finished = file.finish();
    expect(file.finish()).toBe(finished);
    await vi.waitFor(() => expect(stream.write).toHaveBeenCalledTimes(1));
    expect(stream.close).not.toHaveBeenCalled();
    complete();
    await finished;
    expect(stream.write.mock.calls.map(([chunk]) => chunk)).toEqual([first, final]);
    expect(stream.close).toHaveBeenCalledTimes(1);
  });

  it('bounds the pending write queue when the disk cannot keep up', async () => {
    const { file } = harness();
    const chunk = new Blob(['chunk']);
    Object.defineProperty(chunk, 'size', { value: MAX_RECORDING_BYTES / 2 });
    expect(file.append(chunk)).toBe(false);
    expect(file.append(chunk)).toBe(true);
    await file.finish();
  });

  it('stops accepting writes after a disk failure and reports the failed save', async () => {
    const { file, stream, onError } = harness();
    stream.write.mockRejectedValueOnce(new Error('disk full'));
    file.append(new Blob(['first']));
    file.append(new Blob(['later']));
    await expect(file.finish()).rejects.toThrow('disk full');
    expect(stream.write).toHaveBeenCalledTimes(1);
    expect(stream.abort).toHaveBeenCalledTimes(1);
    expect(stream.close).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('discards pending output when cancelled during finalization', async () => {
    const { file, stream } = harness();
    let complete!: () => void;
    stream.write.mockImplementationOnce(() => new Promise<void>((resolve) => (complete = resolve)));
    file.append(new Blob(['first']));
    file.append(new Blob(['later']));
    await vi.waitFor(() => expect(stream.write).toHaveBeenCalledTimes(1));
    const finished = file.finish();
    const aborted = file.abort();
    complete();
    await Promise.all([finished, aborted]);
    expect(stream.write).toHaveBeenCalledTimes(1);
    expect(stream.close).not.toHaveBeenCalled();
    expect(stream.abort).toHaveBeenCalledTimes(1);
  });

  it('aborts and propagates a failure to finalize the file', async () => {
    const { file, stream } = harness();
    stream.close.mockRejectedValueOnce(new Error('close failed'));
    file.append(new Blob(['first']));
    await expect(file.finish()).rejects.toThrow('close failed');
    expect(stream.abort).toHaveBeenCalledTimes(1);
  });
});
