// Network operations do not read or mutate the page.
export async function requestJSON(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || '本機程式沒有回應，請重新開啟介面。');
    error.jobId = result.job_id;
    throw error;
  }
  return result;
}

export function uploadAudio(file, identity, onProgress) {
  const request = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    request.open('POST', `/api/jobs/${identity}/audio`);
    request.setRequestHeader('Content-Type', 'application/octet-stream');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((100 * event.loaded) / event.total));
    };
    request.onload = () => {
      try {
        const response = JSON.parse(request.responseText);
        if (request.status >= 400) reject(new Error(response.error || '歌曲匯入失敗。'));
        else resolve(response);
      } catch {
        reject(new Error('歌曲匯入失敗，請再試一次。'));
      }
    };
    request.onerror = () => reject(new Error('無法連接本機程式，請重新開啟介面。'));
    request.onabort = () => reject(new Error('已停止匯入。'));
    request.send(file);
  });
  return { promise, abort: () => request.abort() };
}
