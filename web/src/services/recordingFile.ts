import { MAX_RECORDING_BYTES } from './recordingBuffer';

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

function saveFilePicker() {
  return (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
}

export function canStreamRecording() {
  return typeof saveFilePicker() === 'function';
}

// Call before font/audio preparation so the picker retains the recording button's user gesture.
export async function openRecordingFile(
  filename: string,
  mimeType: string,
  onError: () => void,
): Promise<RecordingFile | null> {
  const picker = saveFilePicker();
  if (!picker) return null;
  const type = mimeType.split(';')[0];
  const handle = await picker.call(window, {
    suggestedName: filename.replace(/[\\/:*?"<>|]/g, '_'),
    types: [
      { description: '錄影影片', accept: { [type]: [type === 'video/mp4' ? '.mp4' : '.webm'] } },
    ],
  });
  return new RecordingFile(await handle.createWritable(), onError);
}

export class RecordingFile {
  bytes = 0;
  private pendingBytes = 0;
  private writes = Promise.resolve();
  private failure: Error | null = null;
  private discarded = false;
  private completion: Promise<void> | null = null;

  constructor(
    private readonly stream: FileSystemWritableFileStream,
    private readonly onError: () => void,
  ) {}

  append(chunk: Blob): boolean {
    if (!chunk.size || this.completion) return false;
    this.bytes += chunk.size;
    this.pendingBytes += chunk.size;
    this.writes = this.writes.then(async () => {
      try {
        if (!this.failure && !this.discarded) await this.stream.write(chunk);
      } catch (cause) {
        this.failure = cause instanceof Error ? cause : new Error('無法寫入錄影檔案。');
        this.onError();
      } finally {
        this.pendingBytes -= chunk.size;
      }
    });
    // Only queued, unwritten data counts toward the memory limit, not the whole video.
    return this.pendingBytes >= MAX_RECORDING_BYTES;
  }

  finish(): Promise<void> {
    if (!this.completion)
      this.completion = (async () => {
        await this.writes;
        if (this.discarded || this.failure) {
          await this.stream.abort().catch(() => {});
          if (this.failure && !this.discarded) throw this.failure;
        } else {
          try {
            await this.stream.close();
          } catch (cause) {
            await this.stream.abort().catch(() => {});
            throw cause;
          }
        }
      })();
    return this.completion;
  }

  abort(): Promise<void> {
    this.discarded = true;
    return this.finish();
  }
}
