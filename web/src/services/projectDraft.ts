import {
  unpackProject,
  validateManifest,
  type ProjectData,
  type ProjectManifest,
} from '../domain/project';

interface StoredDraft {
  version: 2;
  revision: string;
  savedAt: number;
  manifest: ProjectManifest;
  fileIds: string[];
  bytes: number;
}
interface LegacyDraft {
  blob: Blob;
  savedAt: number;
}
export interface DraftSummary {
  revision: string;
  savedAt: number;
  name: string;
  bytes: number;
  mediaCount: number | null;
}
const fileIds = new WeakMap<File, string>();
export class DraftConflictError extends Error {
  constructor() {
    super('其他分頁已更新或刪除草稿，請先選擇要保留的版本。');
  }
}
function revision(draft?: StoredDraft | LegacyDraft) {
  return draft ? ('revision' in draft ? draft.revision : `legacy-${draft.savedAt}`) : null;
}
function summary(draft?: StoredDraft | LegacyDraft): DraftSummary | null {
  if (!draft) return null;
  return {
    revision: revision(draft)!,
    savedAt: draft.savedAt,
    name: 'manifest' in draft ? draft.manifest.settings.songName || '未命名作品' : '舊版草稿',
    bytes: 'bytes' in draft ? draft.bytes : draft.blob.size,
    mediaCount: 'fileIds' in draft ? draft.fileIds.length : null,
  };
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let rejected = false;
    const request = indexedDB.open('resonance-projects', 2);
    request.onupgradeneeded = () => {
      for (const store of ['drafts', 'media'])
        if (!request.result.objectStoreNames.contains(store))
          request.result.createObjectStore(store);
    };
    request.onsuccess = () => {
      if (rejected) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      rejected = true;
      reject(new Error('請關閉使用舊版的分頁，再重試草稿儲存。'));
    };
  });
}
function result<Value>(request: IDBRequest<Value>): Promise<Value> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readDraftState() {
  const db = await database();
  try {
    const store = db.transaction('drafts').objectStore('drafts');
    const [draft, token] = await Promise.all([
      result(store.get('current')),
      result(store.get('revision')),
    ]);
    return { current: summary(draft), revision: (token as string | undefined) ?? revision(draft) };
  } finally {
    db.close();
  }
}
export async function loadDraft(expected: string): Promise<ProjectData> {
  const db = await database();
  try {
    const transaction = db.transaction(['drafts', 'media']);
    const draft: StoredDraft | LegacyDraft | undefined = await result(
      transaction.objectStore('drafts').get('current'),
    );
    if (!draft || revision(draft) !== expected) throw new DraftConflictError();
    if ('blob' in draft) return unpackProject(draft.blob);
    // Enqueue all reads together while the readonly transaction is active.
    const files = await Promise.all(
      draft.fileIds.map((id) => result<File | undefined>(transaction.objectStore('media').get(id))),
    );
    if (files.some((file) => !(file instanceof File)))
      throw new Error('草稿素材不完整，請開啟已下載的專案檔。');
    const complete = files as File[];
    complete.forEach((file, index) => fileIds.set(file, draft.fileIds[index]));
    return { manifest: validateManifest(draft.manifest, complete.length), files: complete };
  } finally {
    db.close();
  }
}
// Metadata, new files and removed files commit atomically; existing media is never rewritten.
export async function saveDraft(
  project: ProjectData,
  expected: string | null,
): Promise<DraftSummary> {
  const manifest = validateManifest(project.manifest, project.files.length);
  const ids = project.files.map((file) => {
    let id = fileIds.get(file);
    if (!id) {
      id = crypto.randomUUID();
      fileIds.set(file, id);
    }
    return id;
  });
  const draft: StoredDraft = {
    version: 2,
    revision: crypto.randomUUID(),
    savedAt: Date.now(),
    manifest,
    fileIds: ids,
    bytes: project.files.reduce((bytes, file) => bytes + file.size, 0),
  };
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['drafts', 'media'], 'readwrite');
      let failure: Error | undefined;
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(failure || transaction.error);
      transaction.onabort = () => reject(failure || transaction.error);
      const drafts = transaction.objectStore('drafts'),
        media = transaction.objectStore('media');
      const current = drafts.get('current');
      const token = transaction.objectStore('drafts').get('revision');
      token.onsuccess = () => {
        if ((token.result ?? revision(current.result)) !== expected) {
          failure = new DraftConflictError();
          transaction.abort();
          return;
        }
        const keys = media.getAllKeys();
        keys.onsuccess = () => {
          try {
            const present = new Set(keys.result),
              keep = new Set(ids);
            ids.forEach((id, index) => {
              if (!present.has(id)) {
                media.put(project.files[index], id);
                present.add(id);
              }
            });
            keys.result.forEach((key) => {
              if (!keep.has(String(key))) media.delete(key);
            });
            drafts.put(draft, 'current');
            drafts.put(draft.revision, 'revision');
          } catch (cause) {
            failure = cause instanceof Error ? cause : new Error(String(cause));
            transaction.abort();
          }
        };
      };
    });
    return summary(draft)!;
  } finally {
    db.close();
  }
}
export async function deleteDraft(expected: string | null) {
  // A small generation token survives deletion to reject pending writes from stale empty tabs.
  const nextRevision = crypto.randomUUID();
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['drafts', 'media'], 'readwrite');
      let failure: Error | undefined;
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(failure || transaction.error);
      transaction.onabort = () => reject(failure || transaction.error);
      const current = transaction.objectStore('drafts').get('current');
      const token = transaction.objectStore('drafts').get('revision');
      token.onsuccess = () => {
        if ((token.result ?? revision(current.result)) !== expected) {
          failure = new DraftConflictError();
          transaction.abort();
          return;
        }
        try {
          transaction.objectStore('drafts').delete('current');
          transaction.objectStore('drafts').put(nextRevision, 'revision');
          transaction.objectStore('media').clear();
        } catch (cause) {
          failure = cause instanceof Error ? cause : new Error(String(cause));
          transaction.abort();
        }
      };
    });
    return nextRevision;
  } finally {
    db.close();
  }
}
