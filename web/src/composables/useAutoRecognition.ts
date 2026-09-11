import { onBeforeUnmount, ref, type Ref } from 'vue';
import { autoRecognitionEnabled } from '../config/features';
import { parseSubtitles, serializeSrt } from '../domain/subtitles';
import type { MediaClip } from '../domain/mediaSequence';

interface Job {
  id: string;
  status: string;
  message: string;
  progress?: { percent: number | null };
  result?: { unmatched_count: number; review_count: number };
}

async function request(path: string, options?: RequestInit) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options?.signal?.aborted) abort();
  options?.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 30000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || `辨識服務連線失敗（${response.status}）。`);
    }
    return response;
  } catch (cause) {
    if (controller.signal.aborted && !options?.signal?.aborted)
      throw new Error('辨識服務連線逾時，請確認後端仍在執行。');
    throw cause;
  } finally {
    clearTimeout(timeout);
    options?.signal?.removeEventListener('abort', abort);
  }
}

export function useAutoRecognition(busy: Ref<boolean>) {
  const message = ref('');
  const percent = ref<number | null>(null);
  const error = ref('');
  const cancelling = ref(false);
  let jobId = '';
  let disposed = false;
  let transfer: AbortController | undefined;
  let cancelConfirmed = false;
  let cancellation: Promise<void> | undefined;

  async function cancelJob() {
    if (!jobId) return;
    cancellation ??= request(`/api/jobs/${jobId}/cancel`, { method: 'POST' }).then(() => {});
    try {
      await cancellation;
      cancelConfirmed = true;
    } catch (cause) {
      cancellation = undefined;
      throw cause;
    }
  }
  async function cancel() {
    if (!autoRecognitionEnabled || !busy.value) return;
    cancelling.value = true;
    transfer?.abort();
    try {
      await cancelJob();
    } catch (cause) {
      error.value = `取消失敗：${cause instanceof Error ? cause.message : '請稍後重試。'}`;
    }
  }

  async function start(file: File, text: string, clips: MediaClip[], apply: (srt: string) => void) {
    if (!autoRecognitionEnabled) {
      error.value = '此版本未提供自動辨識，請匯入字幕或使用手動對時。';
      return false;
    }
    if (busy.value || disposed) return false;
    busy.value = true;
    error.value = '';
    message.value = '正在檢查辨識服務…';
    percent.value = null;
    cancelling.value = false;
    cancellation = undefined;
    jobId = '';
    cancelConfirmed = false;
    transfer = new AbortController();
    try {
      const health = await (await request('/api/health', { signal: transfer.signal })).json();
      if (!health.ready) throw new Error('辨識引擎或模型尚未安裝，請先完成 LyricFlow 安裝。');
      if (cancelling.value || disposed) return false;
      const created: Job = await (
        await request('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, size: file.size, lyrics: text, threads: 4 }),
        })
      ).json();
      jobId = created.id;
      if (cancelling.value || disposed) {
        await cancelJob();
        return false;
      }
      message.value = '正在匯入歌曲…';
      await request(`/api/jobs/${jobId}/audio`, {
        method: 'POST',
        body: file,
        signal: transfer.signal,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      while (!cancelling.value && !disposed) {
        const job: Job = await (
          await request(`/api/jobs/${jobId}`, { signal: transfer.signal })
        ).json();
        if (cancelling.value || disposed) break;
        message.value = job.message;
        percent.value = job.progress?.percent ?? null;
        if (job.status === 'error') throw new Error(job.message);
        if (job.status === 'cancelled') return false;
        if (job.status === 'done') {
          const srt = await (
            await request(`/api/jobs/${jobId}/srt`, { signal: transfer.signal })
          ).text();
          if (cancelling.value || disposed) break;
          const cues = parseSubtitles(srt);
          const mapped = clips
            .flatMap((clip) =>
              cues.flatMap((cue) => {
                const start = Math.max(cue.time, clip.trimStart);
                const end = Math.min(cue.endTime, clip.trimStart + clip.duration);
                return end > start
                  ? [
                      {
                        ...cue,
                        time: start - clip.trimStart + clip.start,
                        endTime: end - clip.trimStart + clip.start,
                      },
                    ]
                  : [];
              }),
            )
            .sort((first, second) => first.time - second.time);
          if (!mapped.length)
            throw new Error('未找到可套用的字幕，原有字幕已保留。請檢查歌曲與歌詞是否相符。');
          apply(serializeSrt(mapped));
          message.value = `辨識完成，已套用 ${mapped.length} 句字幕。未定位 ${job.result?.unmatched_count ?? 0} 句，需檢查 ${job.result?.review_count ?? 0} 句。`;
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await cancelJob();
      return false;
    } catch (cause) {
      if (!cancelling.value && !disposed)
        error.value = cause instanceof Error ? cause.message : '辨識服務連線失敗。';
      try {
        await cancelJob();
      } catch {
        error.value += ' 無法確認工作已停止，請重新啟動後端後再試。';
      }
      return false;
    } finally {
      if (cancelling.value)
        message.value =
          jobId && !cancelConfirmed
            ? '已停止套用結果，原有字幕已保留；無法確認後端工作已停止。'
            : '已取消辨識，原有字幕已保留。';
      busy.value = false;
      cancelling.value = false;
      transfer = undefined;
      jobId = '';
    }
  }
  onBeforeUnmount(() => {
    disposed = true;
    void cancel();
  });
  return { busy, message, percent, error, cancelling, start, cancel };
}
