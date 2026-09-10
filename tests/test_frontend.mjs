import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestJSON, uploadAudio } from '../web/api.mjs';
import { formatProgress } from '../web/progress.mjs';

test('stage progress handles zero, partial, unknown and completed values', () => {
  assert.equal(formatProgress({ percent: 0 }).label, '0%');
  assert.equal(formatProgress({ percent: 62, stage: 'recognizing' }).value, 62);
  assert.equal(formatProgress({ percent: null }).label, '處理中');
  assert.equal(formatProgress({ percent: 100 }).label, '100%');
  assert.match(formatProgress({ stage: 'retrying' }).hint, /補查片段/);
});

test('API errors preserve the busy job ID for the UI', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ error: '忙碌', job_id: 'existing' }),
  });
  try {
    await assert.rejects(
      requestJSON('/api/jobs'),
      (error) => error.message === '忙碌' && error.jobId === 'existing',
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('upload adapter reports progress and can abort without accessing the DOM', async () => {
  const original = globalThis.XMLHttpRequest;
  let transport;
  globalThis.XMLHttpRequest = class {
    constructor() {
      transport = this;
      this.upload = {};
    }
    open() {}
    setRequestHeader() {}
    send() {}
    abort() {
      this.onabort();
    }
  };
  try {
    const percentages = [];
    const upload = uploadAudio({}, 'job', (value) => percentages.push(value));
    transport.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 });
    assert.deepEqual(percentages, [50]);
    upload.abort();
    await assert.rejects(upload.promise, /已停止匯入/);
  } finally {
    globalThis.XMLHttpRequest = original;
  }
});
