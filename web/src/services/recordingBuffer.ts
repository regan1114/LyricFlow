export const MAX_RECORDING_BYTES = 256 * 1024 * 1024;

// Preserve completed chunks, including the final recorder chunk after the limit is reached.
export class RecordingBuffer {
  private chunks: Blob[] = [];
  bytes = 0;

  constructor(readonly limit = MAX_RECORDING_BYTES) {}

  append(chunk: Blob): boolean {
    if (chunk.size) {
      this.chunks.push(chunk);
      this.bytes += chunk.size;
    }
    return this.bytes >= this.limit;
  }

  take(mimeType: string): Blob | null {
    const result = this.bytes ? new Blob(this.chunks, { type: mimeType }) : null;
    this.clear();
    return result;
  }

  clear() {
    this.chunks = [];
    this.bytes = 0;
  }
}
