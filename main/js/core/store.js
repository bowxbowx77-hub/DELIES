/**
 * DELIES data store.
 *
 * Architecture: an in-memory cache is the single source of truth for rendering
 * (synchronous reads), and a pluggable async adapter persists it. The primary
 * adapter is IndexedDB; localStorage and an in-memory adapter are fallbacks for
 * restricted environments (file://, private mode, WebView without IDB).
 *
 * All entities are normalised by the sanitisers before they enter the cache, so
 * corrupted storage or a hostile import file cannot break rendering.
 */

import { sanitizers } from './validate.js';

export const COLLECTIONS = [
  'tasks',
  'events',
  'reminders',
  'notes',
  'lists',
  'listItems',
  'categories',
  'history'
];

const DB_NAME = 'delies';
const DB_VERSION = 1;
const SETTINGS_KEY = 'app';

function clone(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

export class MemoryAdapter {
  constructor() {
    this.kind = 'memory';
    this.data = new Map();
  }

  async init() {}

  async loadAll() {
    const out = {};
    COLLECTIONS.forEach((type) => {
      out[type] = (this.data.get(type) || []).map(clone);
    });
    return out;
  }

  async saveCollection(type, items) {
    this.data.set(type, items.map(clone));
  }

  async clearAll() {
    this.data.clear();
  }
}

export class LocalStorageAdapter {
  constructor(storage) {
    this.kind = 'localstorage';
    this.storage = storage;
  }

  key(type) {
    return `delies.v1.${type}`;
  }

  async init() {
    // Probe: Safari private mode throws on write.
    try {
      this.storage.setItem('delies.probe', '1');
      this.storage.removeItem('delies.probe');
    } catch {
      throw new Error('localStorage unavailable');
    }
  }

  async loadAll() {
    const out = {};
    COLLECTIONS.forEach((type) => {
      const raw = this.storage.getItem(this.key(type));
      const value = raw ? safeParse(raw, []) : [];
      out[type] = Array.isArray(value) ? value : [];
    });
    const settingsRaw = this.storage.getItem(this.key('settings'));
    const settingsValue = settingsRaw ? safeParse(settingsRaw, []) : [];
    out.settings = Array.isArray(settingsValue) ? settingsValue : [];
    return out;
  }

  async saveCollection(type, items) {
    this.storage.setItem(this.key(type), JSON.stringify(items));
  }

  async clearAll() {
    COLLECTIONS.forEach((type) => this.storage.removeItem(this.key(type)));
    this.storage.removeItem('delies.v1.settings');
  }
}

export class IndexedDbAdapter {
  constructor(factory) {
    this.kind = 'indexeddb';
    this.factory = factory;
    this.db = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      let request;
      try {
        request = this.factory.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        [...COLLECTIONS, 'settings'].forEach((type) => {
          if (!db.objectStoreNames.contains(type)) db.createObjectStore(type, { keyPath: 'id' });
        });
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => this.db.close();
        resolve();
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  store(type, mode) {
    const tx = this.db.transaction(type, mode);
    return { tx, store: tx.objectStore(type) };
  }

  read(type) {
    return new Promise((resolve, reject) => {
      let request;
      try {
        request = this.store(type, 'readonly').store.getAll();
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async loadAll() {
    const out = {};
    for (const type of COLLECTIONS) {
      out[type] = await this.read(type);
    }
    out.settings = await this.read('settings');
    return out;
  }

  saveCollection(type, items) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = this.db.transaction(type, 'readwrite');
      } catch (error) {
        reject(error);
        return;
      }
      const store = tx.objectStore(type);
      store.clear();
      items.forEach((item) => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  async clearAll() {
    for (const type of [...COLLECTIONS, 'settings']) {
      await this.saveCollection(type, []);
    }
  }
}

/**
 * Picks the best available adapter.
 * @returns {Promise<{adapter: object, warnings: string[]}>}
 */
export async function createAdapter(env = {}) {
  const warnings = [];
  const idbFactory = env.indexedDB !== undefined ? env.indexedDB : typeof indexedDB !== 'undefined' ? indexedDB : null;
  if (idbFactory) {
    try {
      const adapter = new IndexedDbAdapter(idbFactory);
      await adapter.init();
      // Verify a real round-trip: some browsers expose IDB but block writes.
      await adapter.saveCollection('history', []);
      return { adapter, warnings };
    } catch (error) {
      warnings.push(`IndexedDB недоступен: ${error && error.message ? error.message : error}`);
    }
  }
  const storage = env.localStorage !== undefined ? env.localStorage : safeLocalStorage();
  if (storage) {
    try {
      const adapter = new LocalStorageAdapter(storage);
      await adapter.init();
      return { adapter, warnings };
    } catch (error) {
      warnings.push(`localStorage недоступен: ${error && error.message ? error.message : error}`);
    }
  }
  return { adapter: new MemoryAdapter(), warnings };
}

function safeLocalStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch {
    /* access can throw in sandboxed frames */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class Store {
  constructor(adapter) {
    this.adapter = adapter;
    this.cache = new Map();
    COLLECTIONS.forEach((type) => this.cache.set(type, []));
    this.settings = null;
    this.listeners = new Set();
    this.errorListeners = new Set();
    this.dirty = new Set();
    this.flushTimer = 0;
    this.flushing = null;
    this.ready = false;
  }

  get storageKind() {
    return this.adapter ? this.adapter.kind : 'memory';
  }

  onError(listener) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  emitError(error, context) {
    this.errorListeners.forEach((fn) => {
      try {
        fn(error, context);
      } catch {
        /* listener must not break the store */
      }
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[DELIES] store listener failed', error);
      }
    });
  }

  async open() {
    const raw = await this.adapter.loadAll();
    COLLECTIONS.forEach((type) => {
      const sanitize = sanitizers[type];
      const list = Array.isArray(raw[type]) ? raw[type] : [];
      this.cache.set(
        type,
        list
          .map((item) => {
            try {
              return sanitize(item);
            } catch {
              return null;
            }
          })
          .filter((item) => item && (item.title || item.name || item.reminderId))
      );
    });
    const settingsRow = Array.isArray(raw.settings) ? raw.settings.find((row) => row && row.id === SETTINGS_KEY) : null;
    this.settings = settingsRow ? { ...settingsRow } : null;
    this.ready = true;
    return this;
  }

  // --- reads -------------------------------------------------------------
  all(type) {
    return (this.cache.get(type) || []).slice();
  }

  get(type, id) {
    return (this.cache.get(type) || []).find((item) => item.id === id) || null;
  }

  find(type, predicate) {
    return (this.cache.get(type) || []).filter(predicate);
  }

  count(type, predicate) {
    const list = this.cache.get(type) || [];
    return predicate ? list.filter(predicate).length : list.length;
  }

  getSettings() {
    return this.settings ? { ...this.settings } : null;
  }

  // --- writes ------------------------------------------------------------
  put(type, entity) {
    if (!COLLECTIONS.includes(type)) throw new Error(`Unknown collection: ${type}`);
    const sanitized = sanitizers[type](entity);
    if (!sanitized.id) throw new Error('Entity must have an id');
    const list = this.cache.get(type) || [];
    const index = list.findIndex((item) => item.id === sanitized.id);
    const isNew = index === -1;
    if (isNew) list.push(sanitized);
    else list[index] = sanitized;
    this.cache.set(type, list);
    this.markDirty(type);
    this.emit({ type, action: isNew ? 'create' : 'update', entity: clone(sanitized) });
    return sanitized;
  }

  remove(type, id) {
    const list = this.cache.get(type) || [];
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const [removed] = list.splice(index, 1);
    this.cache.set(type, list);
    this.markDirty(type);
    this.emit({ type, action: 'delete', entity: clone(removed) });
    return removed;
  }

  removeMany(type, ids) {
    const set = new Set(ids);
    const list = this.cache.get(type) || [];
    const kept = [];
    const removed = [];
    list.forEach((item) => (set.has(item.id) ? removed.push(item) : kept.push(item)));
    if (!removed.length) return [];
    this.cache.set(type, kept);
    this.markDirty(type);
    this.emit({ type, action: 'delete', entity: clone(removed) });
    return removed;
  }

  /** Bulk insert without per-item events (used by import). */
  bulkLoad(type, items) {
    const sanitize = sanitizers[type];
    const list = items
      .map((item) => {
        try {
          return sanitize(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    this.cache.set(type, list);
    this.markDirty(type);
    return list.length;
  }

  async saveSettings(settings) {
    this.settings = { ...settings };
    this.markDirty('settings');
    this.emit({ type: 'settings', action: 'update', entity: { ...settings } });
    await this.flush();
    return this.settings;
  }

  markDirty(type) {
    this.dirty.add(type);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = 0;
      this.flush().catch((error) => this.emitError(error, 'flush'));
    }, 60);
  }

  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = 0;
    }
    if (this.flushing) {
      await this.flushing;
      if (!this.dirty.size) return;
    }
    const types = Array.from(this.dirty);
    if (!types.length) return;
    this.dirty.clear();
    this.flushing = (async () => {
      for (const type of types) {
        try {
          if (type === 'settings') {
            const rows = this.settings ? [{ ...this.settings, id: SETTINGS_KEY }] : [];
            await this.adapter.saveCollection('settings', rows);
          } else {
            await this.adapter.saveCollection(type, this.cache.get(type) || []);
          }
        } catch (error) {
          this.dirty.add(type);
          this.emitError(error, `save:${type}`);
        }
      }
    })();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  /** Full snapshot used by export / native backup. */
  snapshot() {
    const data = {};
    COLLECTIONS.forEach((type) => {
      data[type] = clone(this.cache.get(type) || []);
    });
    return {
      app: 'DELIES',
      schema: 1,
      exportedAt: new Date().toISOString(),
      settings: this.settings ? clone(this.settings) : null,
      data
    };
  }

  async replaceAll(snapshotData, settings) {
    for (const type of COLLECTIONS) {
      const items = Array.isArray(snapshotData[type]) ? snapshotData[type] : [];
      this.bulkLoad(type, items);
    }
    if (settings) this.settings = { ...settings };
    await this.flush();
    this.emit({ type: '*', action: 'replace', entity: null });
  }

  async clearAll() {
    COLLECTIONS.forEach((type) => {
      this.cache.set(type, []);
      this.dirty.add(type);
    });
    this.settings = null;
    this.dirty.add('settings');
    await this.flush();
    this.emit({ type: '*', action: 'replace', entity: null });
  }
}

export async function openStore(env) {
  const { adapter, warnings } = await createAdapter(env);
  const store = new Store(adapter);
  await store.open();
  return { store, warnings };
}
