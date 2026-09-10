import { requestJSON as api, uploadAudio } from './api.mjs';
import { saved } from './storage.mjs';
import { formatProgress } from './progress.mjs';
import { parseTime, formatTime, validateRows, makeSrt } from './subtitles.mjs';

const byId = (id) => document.getElementById(id);
const player = byId('player');
let selectedFile = null,
  audioURL = null,
  currentJob = null,
  rows = [],
  busy = false,
  ready = false;
let duration = 0,
  activeIndex = -1,
  reviewOnly = false,
  pollTimer = null,
  upload = null,
  lyricsSnapshot = '',
  retryBackup = null;
let toastTimer;
const isReview = (row) => row.status === 'review' || row.status === 'unmatched';

function toast(message) {
  clearTimeout(toastTimer);
  byId('toast').textContent = message;
  byId('toast').hidden = false;
  toastTimer = setTimeout(() => {
    byId('toast').hidden = true;
  }, 4000);
}
function showError(message = '') {
  byId('error-box').textContent = message;
  byId('error-box').hidden = !message;
}
function lyricCount() {
  return byId('lyrics')
    .value.replace(/\[[^\]]*\]/g, '')
    .split('\n')
    .filter((line) => /[\p{L}\p{N}]/u.test(line)).length;
}
function syncForm() {
  byId('line-count').textContent = `${lyricCount()} 行歌詞`;
  byId('start-button').disabled = !ready || busy || !selectedFile || !lyricCount();
  byId('inputs').disabled = busy;
  byId('start-button').firstElementChild.textContent = busy ? '正在對齊…' : '開始對齊';
  if (rows.length) refreshExport();
}
function clearResults() {
  rows = [];
  activeIndex = -1;
  currentJob = null;
  retryBackup = null;
  reviewOnly = false;
  byId('results').hidden = true;
  byId('empty-state').hidden = false;
  byId('result-count').textContent = '等待對齊';
  byId('lyric-rows').replaceChildren();
  byId('current-subtitle').textContent = '準備開始對齊';
  saved.remove('lyric-flow:last-job');
}
function setFile(file) {
  if (!file || busy) return;
  if (!/\.(wav|mp3|m4a|aac|flac|aiff|aif)$/i.test(file.name))
    return showError('請選擇 WAV、MP3、M4A、AAC、FLAC 或 AIFF 音檔。');
  if (!file.size || file.size > 200 * 1024 * 1024)
    return showError('請選擇 200 MB 以內的有效音檔。');
  showError();
  clearResults();
  selectedFile = file;
  if (audioURL) URL.revokeObjectURL(audioURL);
  audioURL = URL.createObjectURL(file);
  player.src = audioURL;
  player.hidden = false;
  byId('file-name').textContent = file.name;
  byId('file-detail').textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · 點一下更換歌曲`;
  byId('track-name').textContent = file.name;
  byId('drop-zone').classList.add('selected');
  syncForm();
}

function showProgress(progress) {
  const display = formatProgress(progress);
  if (display.value === null) byId('upload-progress').removeAttribute('value');
  else byId('upload-progress').value = display.value;
  byId('processing-percent').textContent = display.label;
  byId('processing-hint').textContent = display.hint;
}

async function beginAlignment() {
  if (!selectedFile || !lyricCount() || busy || !ready) throw new Error('請先選擇歌曲並填入歌詞。');
  showError();
  busy = true;
  rows = [];
  retryBackup = null;
  lyricsSnapshot = byId('lyrics').value;
  byId('results').hidden = true;
  byId('empty-state').hidden = true;
  byId('processing').hidden = false;
  byId('processing-message').textContent = '正在匯入歌曲…';
  byId('processing-detail').textContent = '匯入完成後開始辨識';
  showProgress({ stage: 'uploading', percent: 0 });
  byId('cancel-button').disabled = true;
  byId('result-count').textContent = '處理中';
  syncForm();
  try {
    currentJob = await api('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: selectedFile.name,
        size: selectedFile.size,
        lyrics: lyricsSnapshot,
        threads: byId('economy').checked ? 2 : 4,
      }),
    });
    saved.set('lyric-flow:last-job', currentJob.id);
    byId('cancel-button').disabled = false;
    const identity = currentJob.id;
    upload = uploadAudio(selectedFile, identity, (percent) => {
      showProgress({ stage: 'uploading', percent });
      byId('processing-detail').textContent = `匯入本機 ${percent}%`;
    });
    const job = await upload.promise;
    upload = null;
    if (!busy || currentJob.id !== identity) return { id: identity, status: 'cancelled' };
    showJob(job);
    poll(identity);
    return { id: identity, status: job.status };
  } catch (error) {
    if (busy) {
      showError(error.message);
      if (currentJob && currentJob.status === 'uploading') {
        api(`/api/jobs/${currentJob.id}/cancel`, { method: 'POST' }).catch(() => {});
      }
      busy = false;
      byId('processing').hidden = true;
      byId('empty-state').hidden = false;
      byId('result-count').textContent = '尚未完成';
      syncForm();
    }
    throw error;
  }
}

function showJob(job) {
  currentJob = job;
  if (job.status === 'done') return showResult(job);
  if (job.status === 'error' || job.status === 'cancelled') {
    if (job.retry_of) return restoreRetry(job);
    busy = false;
    byId('processing').hidden = true;
    byId('empty-state').hidden = false;
    byId('result-count').textContent = job.status === 'cancelled' ? '已停止' : '尚未完成';
    if (job.status === 'error') showError(job.message);
    syncForm();
    return;
  }
  busy = true;
  byId('processing').hidden = false;
  byId('empty-state').hidden = true;
  byId('cancel-button').disabled = false;
  showProgress(job.progress);
  byId('processing-message').textContent = job.message;
  byId('processing-detail').textContent =
    `已經過 ${Math.floor(job.elapsed)} 秒 · 可保持視窗開啟，完成後自動顯示`;
  syncForm();
}

async function beginRetry() {
  if (busy || !currentJob || currentJob.status !== 'done') return;
  if (byId('lyrics').value !== lyricsSnapshot) return showError('歌詞已變更，請先重新對齊。');
  const errors = validateRows(rows, duration);
  if (errors.size) return showError('請先修正時間欄位的錯誤，再補辨識漏句。');
  if (!rows.some((row) => row.start === null && row.end === null))
    return toast('目前沒有未定位的歌詞。');
  retryBackup = { job: currentJob, rows: structuredClone(rows) };
  const original = retryBackup;
  showError();
  busy = true;
  byId('results').hidden = true;
  byId('processing').hidden = false;
  byId('processing-message').textContent = '正在準備補辨識…';
  byId('processing-detail').textContent = '原有時間會保留，可隨時停止補辨識。';
  byId('cancel-button').disabled = true;
  byId('result-count').textContent = '補辨識中';
  showProgress({ stage: 'preparing', percent: null });
  syncForm();
  try {
    const job = await api(`/api/jobs/${currentJob.id}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timings: rows.map(({ start, end }) => ({ start, end })) }),
    });
    saved.set('lyric-flow:last-job', job.id);
    showJob(job);
    if (!['done', 'error', 'cancelled'].includes(job.status)) poll(job.id);
  } catch (error) {
    showResult(original.job, original.rows);
    showError(`未能開始補辨識：${error.message} 原結果已保留。`);
  }
}

async function restoreRetry(job) {
  busy = true;
  syncForm();
  try {
    const backup = retryBackup;
    const original = backup?.job || (await api(`/api/jobs/${job.retry_of}`));
    if (currentJob?.id !== job.id) return;
    saved.set('lyric-flow:last-job', original.id);
    showResult(original, backup?.rows);
    if (job.status === 'error') showError(`補辨識未完成：${job.message} 原結果已保留。`);
    else toast('已停止補辨識，回到原結果。');
  } catch {
    busy = false;
    byId('processing').hidden = true;
    byId('empty-state').hidden = false;
    byId('result-count').textContent = '補辨識未完成';
    showError('補辨識未完成，暫時無法讀取原結果，請確認本機服務後重新整理。');
    syncForm();
  }
}

async function poll(identity) {
  clearTimeout(pollTimer);
  try {
    const job = await api(`/api/jobs/${identity}`);
    if (currentJob?.id !== identity) return;
    showJob(job);
    if (!['done', 'error', 'cancelled'].includes(job.status))
      pollTimer = setTimeout(() => poll(identity), 900);
  } catch {
    byId('processing-message').textContent = '暫時無法連接本機程式';
    byId('processing-detail').textContent = '請確認啟動視窗仍開著；連線恢復後會繼續顯示。';
    byId('upload-progress').removeAttribute('value');
    byId('processing-percent').textContent = '等待連線';
    byId('processing-hint').textContent = '恢復連線後會取得最新進度。';
    pollTimer = setTimeout(() => poll(identity), 2500);
  }
}

function showResult(job, previousRows = null) {
  busy = false;
  currentJob = job;
  retryBackup = null;
  duration = job.result.duration;
  rows = structuredClone(previousRows || job.result.lines);
  const edits = saved.get(`lyric-flow:edits:${job.id}`);
  if (edits && !previousRows) {
    try {
      const values = JSON.parse(edits);
      rows.forEach((row, i) => {
        if (values[i]?.text === row.text && values[i].edited) Object.assign(row, values[i]);
      });
    } catch {}
  }
  rows.forEach((row) => {
    row.startText = row.startText ?? formatTime(row.start);
    row.endText = row.endText ?? formatTime(row.end);
    row.start = parseTime(row.startText);
    row.end = parseTime(row.endText);
  });
  lyricsSnapshot = byId('lyrics').value;
  byId('processing').hidden = true;
  byId('empty-state').hidden = true;
  byId('results').hidden = false;
  byId('result-count').textContent =
    `完成 100% · ${rows.length} 句 · ${Math.round(job.elapsed)} 秒`;
  byId('report-link').href = `/api/jobs/${job.id}/report`;
  byId('all-count').textContent = rows.length;
  byId('review-count').textContent = rows.filter(isReview).length;
  byId('current-subtitle').textContent = '播放歌曲，預覽字幕';
  renderRows();
  syncForm();
}

function renderRows() {
  byId('show-all').classList.toggle('active', !reviewOnly);
  byId('show-review').classList.toggle('active', reviewOnly);
  byId('show-all').setAttribute('aria-pressed', String(!reviewOnly));
  byId('show-review').setAttribute('aria-pressed', String(reviewOnly));
  const fragment = document.createDocumentFragment();
  rows.forEach((row, i) => {
    if (reviewOnly && !isReview(row)) return;
    const element = document.createElement('div');
    element.className = 'lyric-row';
    element.dataset.index = i;
    const number = document.createElement('span');
    number.className = 'row-number';
    number.textContent = String(i + 1).padStart(2, '0');
    const copy = document.createElement('div');
    copy.className = 'row-copy';
    const play = document.createElement('button');
    play.className = 'lyric-play';
    play.type = 'button';
    play.textContent = row.text;
    play.setAttribute('aria-label', `試聽第 ${i + 1} 句：${row.text}`);
    play.onclick = () => {
      if (!Number.isFinite(row.start)) return toast('這一句還未定位，可先填入開始與結束時間。');
      player.currentTime = row.start;
      player.play().catch(() => toast('這個格式無法直接試聽，請改用 WAV 或 MP3。'));
    };
    copy.append(play);
    const badge = document.createElement('span');
    badge.className = 'row-badge';
    if (row.start === null && row.end === null) {
      badge.textContent = '尚未定位 · 可補辨識或手動填入時間';
      badge.classList.add('unmatched');
    } else if (row.edited) {
      badge.textContent = '已調整';
      badge.classList.add('edited');
    } else if (row.status === 'review') badge.textContent = '建議試聽';
    badge.title = (row.notes || [])
      .map((note) => (note.includes('token') ? '時間邊界包含估計值' : note))
      .join('；');
    copy.append(badge);
    const times = document.createElement('div');
    times.className = 'time-inputs';
    ['start', 'end'].forEach((field, k) => {
      if (k) {
        const arrow = document.createElement('span');
        arrow.textContent = '–';
        times.append(arrow);
      }
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'text';
      input.value = row[`${field}Text`];
      input.placeholder = '--:--.---';
      input.maxLength = 12;
      input.setAttribute('aria-label', `第 ${i + 1} 句${field === 'start' ? '開始' : '結束'}時間`);
      input.title = '分:秒.毫秒，例如 01:25.300';
      input.onchange = () => {
        row[`${field}Text`] = input.value;
        row[field] = parseTime(input.value);
        row.edited = true;
        badge.textContent = '已調整';
        badge.className = 'row-badge edited';
        saved.set(`lyric-flow:edits:${currentJob.id}`, JSON.stringify(rows));
        refreshExport();
        updatePlayback();
      };
      times.append(input);
    });
    element.append(number, copy, times);
    fragment.append(element);
  });
  byId('lyric-rows').replaceChildren(fragment);
  byId('filter-empty').hidden = !reviewOnly || rows.some(isReview);
  refreshExport();
  updatePlayback();
}

function refreshExport() {
  const errors = validateRows(rows, duration);
  document.querySelectorAll('.lyric-row').forEach((element) => {
    const error = errors.get(Number(element.dataset.index));
    element.querySelectorAll('input').forEach((input) => {
      input.classList.toggle('invalid', !!error);
      input.setAttribute('aria-invalid', String(!!error));
      input.title = error || '分:秒.毫秒，例如 01:25.300';
    });
  });
  const timed = rows.filter((row) => Number.isFinite(row.start) && Number.isFinite(row.end));
  const changedLyrics = byId('lyrics').value !== lyricsSnapshot;
  const missing = rows.filter((row) => row.start === null && row.end === null).length;
  byId('missing-count').textContent = `未定位 ${missing} 句`;
  byId('retry-button').disabled = busy || !missing || !!errors.size || changedLyrics;
  let retryHint = missing
    ? '只重新辨識漏掉的片段，保留已定位與手動調整的時間。'
    : '每句都有時間了，可試聽確認後下載 SRT。';
  if (currentJob?.operation === 'retry' && currentJob.result) {
    const recovered = currentJob.retry_missing_count - currentJob.result.unmatched_count;
    retryHint = `本次補上 ${recovered} 句；補上的時間請試聽確認。`;
  }
  if (errors.size) retryHint = '請先修正時間欄位的錯誤，再補辨識。';
  if (changedLyrics) retryHint = '歌詞已變更，請先重新對齊。';
  byId('retry-hint').textContent = retryHint;
  byId('download-button').disabled = !!errors.size || !timed.length || changedLyrics;
  let note = '時間為自動估計，建議試聽確認。';
  if (rows.some((row) => row.edited)) note = '下載 SRT 會套用你的時間調整。';
  if (timed.length < rows.length)
    note = `${rows.length - timed.length} 句未定位；下載只包含 ${timed.length} 句，可先補辨識或填入時間。`;
  if (errors.size)
    note = `第 ${errors.keys().next().value + 1} 句：${errors.values().next().value}`;
  if (changedLyrics) note = '歌詞已變更，請重新對齊後再下載。';
  byId('export-note').textContent = note;
}

function updatePlayback() {
  const time = player.currentTime;
  const index = rows.findIndex(
    (row) => Number.isFinite(row.start) && time >= row.start && time < row.end,
  );
  if (index !== activeIndex) {
    activeIndex = index;
    byId('current-subtitle').textContent =
      index < 0 ? (rows.length ? '♪' : '準備開始對齊') : rows[index].text;
  }
  document
    .querySelectorAll('.lyric-row')
    .forEach((element) =>
      element.classList.toggle('active-row', Number(element.dataset.index) === activeIndex),
    );
}

byId('audio-file').addEventListener('change', (event) => setFile(event.target.files[0]));
for (const event of ['dragenter', 'dragover'])
  byId('drop-zone').addEventListener(event, (e) => {
    e.preventDefault();
    if (!busy) byId('drop-zone').classList.add('dragging');
  });
for (const event of ['dragleave', 'drop'])
  byId('drop-zone').addEventListener(event, (e) => {
    e.preventDefault();
    byId('drop-zone').classList.remove('dragging');
  });
byId('drop-zone').addEventListener('drop', (event) => setFile(event.dataTransfer.files[0]));
byId('import-lyrics').onclick = () => byId('lyrics-file').click();
byId('lyrics-file').onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 65536) return showError('歌詞檔過大，請選擇 64 KB 以內的文字檔。');
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    if (content.length > 12000) return showError('歌詞限 12,000 字以內。');
    byId('lyrics').value = content.replace(/^\uFEFF/, '');
    showError();
    syncForm();
    toast('歌詞已匯入');
  } catch {
    showError('歌詞檔無法讀取，請另存為 UTF-8 文字檔或直接貼上歌詞。');
  }
  event.target.value = '';
};
byId('lyrics').addEventListener('input', syncForm);
byId('alignment-form').onsubmit = (event) => {
  event.preventDefault();
  beginAlignment().catch(() => {});
};
byId('cancel-button').onclick = async () => {
  if (!currentJob) return;
  byId('cancel-button').disabled = true;
  try {
    const job = await api(`/api/jobs/${currentJob.id}/cancel`, { method: 'POST' });
    busy = false;
    if (upload) upload.abort();
    upload = null;
    clearTimeout(pollTimer);
    showJob(job);
  } catch {
    showError('未能停止處理，請確認本機程式仍在執行。');
    byId('cancel-button').disabled = false;
  }
};
byId('show-all').onclick = () => {
  reviewOnly = false;
  renderRows();
};
byId('show-review').onclick = () => {
  reviewOnly = true;
  renderRows();
};
byId('retry-button').onclick = beginRetry;
byId('download-button').onclick = () => {
  try {
    const srt = makeSrt(rows, duration);
    const url = URL.createObjectURL(
      new Blob([srt], { type: 'application/x-subrip;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentJob.name.replace(/\.[^.]+$/, '')}.srt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('SRT 已準備下載');
  } catch (error) {
    showError(error.message);
  }
};
player.addEventListener('timeupdate', updatePlayback);
player.addEventListener('loadedmetadata', () => {
  byId('duration-label').textContent = Number.isFinite(player.duration)
    ? formatTime(player.duration).split('.')[0]
    : '--:--';
});
player.hidden = true;
byId('current-subtitle').textContent = '尚未選擇歌曲';

async function init() {
  try {
    const health = await api('/api/health');
    ready = health.ready;
    byId('connection-status').textContent = ready ? '● 本機引擎已就緒' : '本機模型尚未準備好';
    if (!ready) showError('找不到辨識引擎或模型，請保留專案內的 .local 資料夾。');
    const lastJob = saved.get('lyric-flow:last-job');
    if (lastJob && /^[a-f0-9]{32}$/.test(lastJob)) {
      try {
        const job = await api(`/api/jobs/${lastJob}`);
        byId('lyrics').value = job.lyrics || '';
        lyricsSnapshot = byId('lyrics').value;
        byId('track-name').textContent = job.name;
        player.src = `/api/jobs/${job.id}/audio`;
        player.hidden = false;
        showJob(job);
        if (!['done', 'error', 'cancelled'].includes(job.status)) poll(job.id);
      } catch {
        saved.remove('lyric-flow:last-job');
      }
    }
  } catch {
    showError('無法連接本機程式，請在專案資料夾的終端機執行 .venv/bin/python app.py --open。');
    byId('connection-status').textContent = '本機引擎未連線';
  }
  syncForm();
}
init();
