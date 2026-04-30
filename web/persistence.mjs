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
};
