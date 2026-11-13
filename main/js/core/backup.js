/**
 * Backup: export to a JSON file, validate and import a backup.
 * Import never trusts the file: shape, schema and every entity are validated.
 */

import { SCHEMA_VERSION } from '../data/defaults.js';
import { sanitizeSettings, isPlainObject, str } from './validate.js';
import { COLLECTIONS } from './store.js';
import { t } from './i18n.js';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function buildBackup(store) {
  const snapshot = store.snapshot();
  snapshot.schema = SCHEMA_VERSION;
  snapshot.app = 'DELIES';
  return snapshot;
}

export function backupFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `delies-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}.json`;
}

export function serializeBackup(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Validates a backup payload.
 * @returns {{ok: true, data: Object, settings: Object|null} | {ok: false, error: string}}
 */
export function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: t('errors.importInvalid') };
  }
  if (text.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: t('errors.fileTooBig') };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: t('errors.importInvalid') };
  }
  if (!isPlainObject(parsed)) return { ok: false, error: t('errors.importInvalid') };
  if (parsed.app !== 'DELIES') return { ok: false, error: t('errors.importInvalid') };
  if (!isPlainObject(parsed.data)) return { ok: false, error: t('errors.importInvalid') };
  const schema = Number(parsed.schema) || 0;
  if (schema > SCHEMA_VERSION) {
    return { ok: false, error: t('errors.importInvalid') };
  }

  const data = {};
  let total = 0;
  for (const type of COLLECTIONS) {
    const list = Array.isArray(parsed.data[type]) ? parsed.data[type] : [];
    data[type] = list.filter(isPlainObject);
    total += data[type].length;
  }
  const settings = isPlainObject(parsed.settings) ? sanitizeSettings(parsed.settings) : null;
  return { ok: true, data, settings, total };
}

/** Downloads a text file in the browser. */
export function downloadTextFile(filename, content, mime = 'application/json') {
  const safeName = str(filename, 120).replace(/[^\w.\-]/g, '_') || 'delies-backup.json';
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1500);
  return safeName;
}

/** Reads a File/Blob with a hard size limit. */
export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error(t('errors.importFailed')));
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      reject(new Error(t('errors.fileTooBig')));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(t('errors.importFailed')));
    reader.readAsText(file, 'utf-8');
  });
}

/** Opens a native file picker (used when the platform has no <input type=file> support). */
export function openFilePicker(accept = 'application/json,.json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.addEventListener('change', () => {
      resolve(input.files && input.files[0] ? input.files[0] : null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}
