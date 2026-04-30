/**
 * Tier A — always-on draft persistence via IndexedDB.
 *
 * Encapsulates all IndexedDB operations for auto-saving editor session drafts.
 * All methods are wrapped in try/catch — failures return null/false, never throw.
 * Feature-detects IndexedDB availability; if unavailable, all methods are silent no-ops.
 *
 * Draft payload mirrors the session save payload structure from workbench.js saveSessionState().
 */

const DB_NAME = 'asciicker_wb_drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const DIRTY_FLAG_KEY = 'wb_draft_dirty';

/** True if IndexedDB is available in this environment. */
const _idbAvailable = (function () {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch (_) {
    return false;
  }
})();

/** Cached database connection (opened lazily). */
let _dbPromise = null;

/**
 * Open (or create) the IndexedDB database.
 * Returns a Promise<IDBDatabase> or null if unavailable.
 */
function openDB() {
  if (!_idbAvailable) return Promise.resolve(null);
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('sessionId', 'sessionId', { unique: false });
        }
      };

      req.onsuccess = (event) => resolve(event.target.result);

      req.onerror = () => {
        _dbPromise = null;
        resolve(null);
      };

      req.onblocked = () => {
        _dbPromise = null;
        resolve(null);
      };
    } catch (_) {
      _dbPromise = null;
      resolve(null);
    }
  });

  return _dbPromise;
}

/**
 * Save a draft to IndexedDB.
 * @param {Object} payload - JSON-serializable session state
 * @returns {Promise<number|null>} The draft ID, or null on failure
 */
export async function saveDraft(payload) {
  try {
    const db = await openDB();
    if (!db) return null;

    const record = {
      timestamp: Date.now(),
      sessionId: String(payload?.sessionId || payload?.session_id || ''),
      payload: payload,
    };

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.add(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        tx.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  } catch (_) {
    return null;
  }
}

/**
 * Fire-and-forget draft save (for beforeunload).
 * Starts the IDB write but does NOT await it.
 * @param {Object} payload - JSON-serializable session state
 */
export function saveDraftSync(payload) {
  try {
    if (!_idbAvailable) return;
    // Use the cached db directly if available, otherwise open inline
    openDB().then((db) => {
      if (!db) return;
      try {
        const record = {
          timestamp: Date.now(),
          sessionId: String(payload?.sessionId || payload?.session_id || ''),
          payload: payload,
        };
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.add(record);
      } catch (_) { /* best-effort */ }
    }).catch(() => { /* best-effort */ });
  } catch (_) { /* best-effort */ }
}

/**
 * Load the most recent draft from IndexedDB.
 * @returns {Promise<Object|null>} The draft record {id, timestamp, sessionId, payload}, or null
 */
export async function loadLatestDraft() {
  try {
    const db = await openDB();
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const req = index.openCursor(null, 'prev'); // descending by timestamp
        req.onsuccess = (event) => {
          const cursor = event.target.result;
          resolve(cursor ? cursor.value : null);
        };
        req.onerror = () => resolve(null);
        tx.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  } catch (_) {
    return null;
  }
}

/**
 * List all drafts sorted by timestamp (newest first).
 * @returns {Promise<Array>} Array of draft records, or empty array
 */
export async function listDrafts() {
  try {
    const db = await openDB();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const results = [];
        const req = index.openCursor(null, 'prev');
        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results);
          }
        };
        req.onerror = () => resolve([]);
        tx.onerror = () => resolve([]);
      } catch (_) {
        resolve([]);
      }
    });
  } catch (_) {
    return [];
  }
}

/**
 * Delete a specific draft by ID.
 * @param {number} id - The draft auto-increment ID
 * @returns {Promise<boolean>} true if deleted successfully
 */
export async function deleteDraft(id) {
  try {
    const db = await openDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  } catch (_) {
    return false;
  }
}

/**
 * Delete drafts older than maxAgeDays.
 * @param {number} maxAgeDays - Maximum age in days (default: 7)
 * @returns {Promise<number>} Number of drafts deleted
 */
export async function cleanupStaleDrafts(maxAgeDays = 7) {
  try {
    const db = await openDB();
    if (!db) return 0;

    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const range = IDBKeyRange.upperBound(cutoff);
        let deleted = 0;
        const req = index.openCursor(range);
        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            resolve(deleted);
          }
        };
        req.onerror = () => resolve(deleted);
        tx.onerror = () => resolve(deleted);
      } catch (_) {
        resolve(0);
      }
    });
  } catch (_) {
    return 0;
  }
}

/**
 * Set the dirty flag in localStorage (best-effort signal for beforeunload).
 */
export function setDirtyFlag() {
  try {
    localStorage.setItem(DIRTY_FLAG_KEY, String(Date.now()));
  } catch (_) { /* silent */ }
}

/**
 * Clear the dirty flag from localStorage.
 */
export function clearDirtyFlag() {
  try {
    localStorage.removeItem(DIRTY_FLAG_KEY);
  } catch (_) { /* silent */ }
}

/**
 * Read the dirty flag timestamp from localStorage.
 * @returns {number|null} Timestamp when dirty flag was set, or null
 */
export function getDirtyFlag() {
  try {
    const v = localStorage.getItem(DIRTY_FLAG_KEY);
    if (!v) return null;
    const ts = Number(v);
    return Number.isFinite(ts) ? ts : null;
  } catch (_) {
    return null;
  }
}

/**
 * Check if IndexedDB is available.
 * @returns {boolean}
 */
export function isAvailable() {
  return _idbAvailable;
}

// ── Tier B — explicit file I/O ──────────────────────────────────────────────
//
// Provides open/save/export using the File System Access API where available,
// with fallback to file input and Blob download. Mobile export via Web Share API.
// All methods are wrapped in try/catch — failures return null/false, never throw.

/** True if the File System Access API picker is available (Chrome/Edge). */
const _hasFileSystemAccess = typeof window.showOpenFilePicker === 'function';

/** XP file type descriptor for File System Access API pickers. */
const _xpFileType = {
  description: 'REXPaint XP file',
  accept: { 'application/octet-stream': ['.xp'] },
};

/**
 * Open an .xp file via File System Access API picker, or fallback to <input type="file">.
 * Returns { data: ArrayBuffer, handle: FileSystemFileHandle|null, name: string } or null on cancel/error.
 */
export async function openXpFile() {
  try {
    if (_hasFileSystemAccess) {
      // File System Access API path
      let handles;
      try {
        handles = await window.showOpenFilePicker({
          types: [_xpFileType],
          multiple: false,
        });
      } catch (e) {
        // User cancelled the picker — not an error
        if (e && e.name === 'AbortError') return null;
        throw e;
      }
      if (!handles || handles.length === 0) return null;
      const handle = handles[0];
      const file = await handle.getFile();
      const data = await file.arrayBuffer();
      return { data, handle, name: file.name || 'untitled.xp' };
    }

    // Fallback: hidden file input
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xp';
      input.style.display = 'none';
      input.addEventListener('change', async () => {
        try {
          const file = input.files && input.files[0];
          if (!file) { resolve(null); return; }
          if (!file.name.toLowerCase().endsWith('.xp')) { resolve(null); return; }
          const data = await file.arrayBuffer();
          resolve({ data, handle: null, name: file.name || 'untitled.xp' });
        } catch (_) {
          resolve(null);
        } finally {
          input.remove();
        }
      });
      // Handle cancel — input fires no change event on cancel, so resolve after a delay
      // if the element is removed from DOM without a change event.
      input.addEventListener('cancel', () => { resolve(null); input.remove(); });
      document.body.appendChild(input);
      input.click();
    });
  } catch (_) {
    return null;
  }
}

/**
 * Save XP data back to an existing file handle, or fall through to saveXpFileAs.
 * @param {ArrayBuffer|Uint8Array} data - Binary XP data
 * @param {FileSystemFileHandle|null} handle - Existing file handle (from prior open/save-as)
 * @returns {Promise<{handle: FileSystemFileHandle|null, saved: boolean}>}
 */
export async function saveXpFile(data, handle) {
  try {
    if (handle && typeof handle.createWritable === 'function') {
      // Attempt to write back to the same handle
      try {
        // Verify/request permission (may prompt user)
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          const req = await handle.requestPermission({ mode: 'readwrite' });
          if (req !== 'granted') {
            // Permission denied — fall through to save-as
            return saveXpFileAs(data);
          }
        }
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        return { handle, saved: true };
      } catch (e) {
        // Permission revoked or handle stale — fall through to save-as
        if (e && e.name === 'AbortError') return { handle: null, saved: false };
        return saveXpFileAs(data);
      }
    }
    // No handle — prompt with save-as
    return saveXpFileAs(data);
  } catch (_) {
    return { handle: null, saved: false };
  }
}

/**
 * Save XP data via File System Access save picker, or fallback to Blob download.
 * @param {ArrayBuffer|Uint8Array} data - Binary XP data
 * @param {string} [suggestedName] - Suggested file name for the picker
 * @returns {Promise<{handle: FileSystemFileHandle|null, saved: boolean}>}
 */
export async function saveXpFileAs(data, suggestedName) {
  try {
    if (_hasFileSystemAccess) {
      let handle;
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: suggestedName || 'export.xp',
          types: [_xpFileType],
        });
      } catch (e) {
        if (e && e.name === 'AbortError') return { handle: null, saved: false };
        throw e;
      }
      if (!handle) return { handle: null, saved: false };
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return { handle, saved: true };
    }

    // Fallback: Blob download via temporary <a> element
    _downloadBlob(data, suggestedName || 'export.xp');
    return { handle: null, saved: true };
  } catch (_) {
    return { handle: null, saved: false };
  }
}

/**
 * Share an XP file via Web Share API (mobile), or fall back to download.
 * @param {ArrayBuffer|Uint8Array} data - Binary XP data
 * @param {string} [filename] - File name for sharing/download
 * @returns {Promise<boolean>} true if shared or downloaded successfully
 */
export async function shareXpFile(data, filename) {
  try {
    const name = filename || 'export.xp';
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const file = new File([blob], name, { type: 'application/octet-stream' });

    // Check if Web Share API supports files
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return true;
      } catch (e) {
        // User cancelled share — fall through to download
        if (e && e.name === 'AbortError') return false;
        // Share failed — fall through to download
      }
    }

    // Fallback: Blob download
    _downloadBlob(data, name);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Clear the Tier A draft "unsaved" state after a successful Tier B save.
 * Removes the dirty flag and optionally clears the latest draft record.
 */
export function clearDraftAfterFileSave() {
  try {
    clearDirtyFlag();
    // Also clear the latest draft from IDB so the restore banner
    // does not offer stale content that has been saved to a file.
    if (_idbAvailable) {
      loadLatestDraft().then((draft) => {
        if (draft && draft.id != null) {
          deleteDraft(draft.id).catch(() => {});
        }
      }).catch(() => {});
    }
  } catch (_) { /* silent */ }
}

/**
 * Internal helper: trigger a Blob download via a temporary <a> element.
 * @param {ArrayBuffer|Uint8Array} data
 * @param {string} filename
 */
function _downloadBlob(data, filename) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Clean up after a short delay to allow the download to start
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

// ── Window export for classic-script consumers (workbench.js IIFE) ──
window.__wbPersistence = {
  saveDraft,
  saveDraftSync,
  loadLatestDraft,
  listDrafts,
  deleteDraft,
  cleanupStaleDrafts,
  setDirtyFlag,
  clearDirtyFlag,
  getDirtyFlag,
  isAvailable,
  // Tier B: file I/O
  openXpFile,
  saveXpFile,
  saveXpFileAs,
  shareXpFile,
  clearDraftAfterFileSave,
};
