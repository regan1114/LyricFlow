const hints = {
  uploading: '歌曲只匯入這台電腦。',
  preparing: '正在讀取或轉換音訊。',
  recognizing: '依已處理的音訊回報，每段完成後更新。',
  cached: '重用這首歌先前的辨識結果。',
  aligning: '正在比對歌詞文字與聲音時間。',
  retrying: '這是目前補查片段的進度。',
  exporting: '正在儲存 SRT 與檢查表。',
};

export function formatProgress(progress = {}) {
  const { stage, percent } = progress;
  const value = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : null;
  return {
    value,
    label: value === null ? '處理中' : `${value}%`,
    hint: hints[stage] || '完成目前階段後會繼續更新。',
  };
}
