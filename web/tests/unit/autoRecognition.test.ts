import { afterEach, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useAutoRecognition } from '../../src/composables/useAutoRecognition';

vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  onBeforeUnmount: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());
const file = new File(['audio'], 'song.wav');
const clip = {
  id: 'clip',
  assetId: 'song',
  track: 'A1' as const,
  start: 10,
  trimStart: 2,
  duration: 3,
  volume: 1,
  muted: false,
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

it('maps recognition to trimmed and moved audio without replacing unrelated times', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json({ ready: true }))
      .mockResolvedValueOnce(json({ id: 'job' }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(
        json({ status: 'done', result: { unmatched_count: 1, review_count: 2 } }),
      )
      .mockResolvedValueOnce(
        new Response(
          '1\n00:00:01,000 --> 00:00:04,000\n歌詞\n\n2\n00:00:06,000 --> 00:00:07,000\n裁切外\n',
        ),
      ),
  );
  const recognition = useAutoRecognition(ref(false));
  const apply = vi.fn();
  expect(await recognition.start(file, '歌詞', [clip], apply)).toBe(true);
  expect(apply).toHaveBeenCalledWith(expect.stringContaining('00:00:10,000 --> 00:00:12,000'));
  expect(apply.mock.calls[0][0]).not.toContain('裁切外');
  expect(recognition.message.value).toContain('未定位 1 句');
});

it('cancels a job created after cancellation, without uploading or applying subtitles', async () => {
  let resolve!: (response: Response) => void;
  const creating = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ ready: true }))
    .mockReturnValueOnce(creating)
    .mockResolvedValueOnce(json({ status: 'cancelled' }));
  vi.stubGlobal('fetch', fetcher);
  const recognition = useAutoRecognition(ref(false));
  const apply = vi.fn();
  const result = recognition.start(file, '歌詞', [clip], apply);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await recognition.cancel();
  resolve(json({ id: 'late-job' }));
  expect(await result).toBe(false);
  expect(fetcher).toHaveBeenLastCalledWith(
    '/api/jobs/late-job/cancel',
    expect.objectContaining({ method: 'POST' }),
  );
  expect(apply).not.toHaveBeenCalled();
  expect(recognition.busy.value).toBe(false);
});

it('does not create a job if the local engine is not installed', async () => {
  const fetcher = vi.fn().mockResolvedValue(json({ ready: false }));
  vi.stubGlobal('fetch', fetcher);
  const recognition = useAutoRecognition(ref(false));
  const apply = vi.fn();
  expect(await recognition.start(file, '歌詞', [clip], apply)).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(apply).not.toHaveBeenCalled();
  expect(recognition.error.value).toContain('尚未安裝');
});

it('cancels a stalled status request without applying late results', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ ready: true }))
    .mockResolvedValueOnce(json({ id: 'job' }))
    .mockResolvedValueOnce(json({}))
    .mockImplementationOnce(
      (_path: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    )
    .mockResolvedValue(json({ status: 'cancelled' }));
  vi.stubGlobal('fetch', fetcher);
  const recognition = useAutoRecognition(ref(false));
  const apply = vi.fn();
  const result = recognition.start(file, '歌詞', [clip], apply);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  await recognition.cancel();
  expect(await result).toBe(false);
  expect(recognition.busy.value).toBe(false);
  expect(recognition.cancelling.value).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});

it('never applies a late result after cancellation fails on the server', async () => {
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>((done) => {
    resolve = done;
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ ready: true }))
    .mockResolvedValueOnce(json({ id: 'job' }))
    .mockResolvedValueOnce(json({}))
    .mockReturnValueOnce(pending)
    .mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetcher);
  const recognition = useAutoRecognition(ref(false));
  const apply = vi.fn();
  const result = recognition.start(file, '歌詞', [clip], apply);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  await recognition.cancel();
  resolve(json({ status: 'done' }));
  expect(await result).toBe(false);
  expect(apply).not.toHaveBeenCalled();
  expect(recognition.message.value).toContain('無法確認後端工作已停止');
});

it('releases the UI after a service connection times out', async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_path: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal!.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const recognition = useAutoRecognition(ref(false));
    const result = recognition.start(file, '歌詞', [clip], vi.fn());
    await vi.advanceTimersByTimeAsync(30001);
    expect(await result).toBe(false);
    expect(recognition.error.value).toContain('連線逾時');
    expect(recognition.busy.value).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
