/**
 * Input validation and normalisation.
 * Every entity written to storage passes through a `sanitize*` function so
 * corrupted or hostile data (imported JSON, tampered storage) can never reach
 * the renderer in an unexpected shape.
 */

export const LIMITS = {
  title: 200,
  body: 8000,
  listTitle: 120,
  itemQty: 999,
  categories: 40,
  subtasks: 40,
  history: 60
};

const FREQS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
const PRIORITIES = ['low', 'medium', 'high', 'none'];
const COLORS = ['purple', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'grey'];

export function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function str(value, maxLength = 2000) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Strip control characters except newline/tab, then clamp the length.
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, maxLength);
}

export function trimmed(value, maxLength = LIMITS.title) {
  return str(value, maxLength).trim();
}

export function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

export function int(value, { min = 0, max = 1000000, fallback = 0 } = {}) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function color(value) {
  return oneOf(value, COLORS, 'purple');
}

export function priority(value) {
  return oneOf(value, PRIORITIES, 'none');
}

export function frequency(value) {
  return oneOf(value, FREQS, 'none');
}

// Ids only ever become object keys and dataset strings, so a conservative
// character class is enough. Length is not restricted: imported backups from
// other DELIES builds may use short ids and their references must stay intact.
export function id(value) {
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)) return value;
  return generateId();
}

export function generateId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(10));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* fall through to Math.random */
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** "YYYY-MM-DD", "YYYY-MM-DDTHH:mm" or '' — anything else becomes ''. */
export function dateKey(value) {
  if (typeof value !== 'string') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return '';
  if (date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return '';
  return value;
}

export function dateTime(value) {
  if (typeof value !== 'string') return '';
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return '';
  if (!dateKey(match[1])) return '';
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return '';
  return `${match[1]}T${match[2]}:${match[3]}`;
}

export function timeString(value) {
  if (typeof value !== 'string') return '';
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '';
  if (Number(match[1]) > 23 || Number(match[2]) > 59) return '';
  return value;
}

export function recurrence(raw) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    freq: frequency(source.freq),
    interval: int(source.interval, { min: 1, max: 99, fallback: 1 }),
    until: dateKey(source.until)
  };
}

export function isoNow() {
  return new Date().toISOString();
}

export function isoTimestamp(value, fallback) {
  if (typeof value !== 'string') return fallback || isoNow();
  const time = Date.parse(value);
  if (Number.isNaN(time)) return fallback || isoNow();
  return new Date(time).toISOString();
}

// ---------------------------------------------------------------------------
// Entity sanitisers
// ---------------------------------------------------------------------------

export function sanitizeTask(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const now = isoNow();
  const subtasks = Array.isArray(source.subtasks)
    ? source.subtasks.slice(0, LIMITS.subtasks).map((item) => ({
        id: id(isPlainObject(item) ? item.id : null),
        title: trimmed(isPlainObject(item) ? item.title : '', 160),
        done: bool(isPlainObject(item) ? item.done : false)
      })).filter((item) => item.title.length > 0)
    : [];
  return {
    id: id(source.id),
    type: 'task',
    title: trimmed(source.title, LIMITS.title),
    notes: str(source.notes, LIMITS.body),
    done: bool(source.done),
    priority: priority(source.priority),
    due: dateKey(source.due),
    dueTime: timeString(source.dueTime),
    categoryId: str(source.categoryId, 64),
    subtasks,
    createdAt: isoTimestamp(source.createdAt, now),
    updatedAt: isoTimestamp(source.updatedAt, now),
    completedAt: source.completedAt ? isoTimestamp(source.completedAt) : ''
  };
}

export function sanitizeEvent(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const now = isoNow();
  const hasTime = bool(source.hasTime, true);
  return {
    id: id(source.id),
    type: 'event',
    title: trimmed(source.title, LIMITS.title),
    notes: str(source.notes, LIMITS.body),
    start: dateKey(source.start) || dateKey(isoNow().slice(0, 10)),
    startTime: hasTime ? timeString(source.startTime) || '09:00' : '',
    endTime: hasTime ? timeString(source.endTime) : '',
    allDay: !hasTime,
    categoryId: str(source.categoryId, 64),
    recurrence: recurrence(source.recurrence),
    createdAt: isoTimestamp(source.createdAt, now),
    updatedAt: isoTimestamp(source.updatedAt, now)
  };
}

export function sanitizeReminder(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const now = isoNow();
  return {
    id: id(source.id),
    type: 'reminder',
    title: trimmed(source.title, LIMITS.title),
    notes: str(source.notes, LIMITS.body),
    at: dateTime(source.at),
    recurrence: recurrence(source.recurrence),
    categoryId: str(source.categoryId, 64),
    enabled: bool(source.enabled, true),
    lastFiredAt: source.lastFiredAt ? isoTimestamp(source.lastFiredAt) : '',
    createdAt: isoTimestamp(source.createdAt, now),
    updatedAt: isoTimestamp(source.updatedAt, now)
  };
}

export function sanitizeNote(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const now = isoNow();
  return {
    id: id(source.id),
    type: 'note',
    title: trimmed(source.title, LIMITS.title),
    body: str(source.body, LIMITS.body),
    pinned: bool(source.pinned),
    categoryId: str(source.categoryId, 64),
    color: color(source.color),
    createdAt: isoTimestamp(source.createdAt, now),
    updatedAt: isoTimestamp(source.updatedAt, now)
  };
}

export function sanitizeList(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const now = isoNow();
  return {
    id: id(source.id),
    type: 'list',
    title: trimmed(source.title, LIMITS.listTitle),
    categoryId: str(source.categoryId, 64),
    createdAt: isoTimestamp(source.createdAt, now),
    updatedAt: isoTimestamp(source.updatedAt, now)
  };
}

export function sanitizeListItem(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const now = isoNow();
  return {
    id: id(source.id),
    type: 'listItem',
    listId: str(source.listId, 64),
    title: trimmed(source.title, LIMITS.title),
    qty: int(source.qty, { min: 1, max: LIMITS.itemQty, fallback: 1 }),
    unit: trimmed(source.unit, 16),
    done: bool(source.done),
    categoryId: str(source.categoryId, 64),
    createdAt: isoTimestamp(source.createdAt, now),
    updatedAt: isoTimestamp(source.updatedAt, now),
    completedAt: source.completedAt ? isoTimestamp(source.completedAt) : ''
  };
}

export const CATEGORY_TYPES = ['task', 'event', 'note', 'reminder', 'shopping'];

export function sanitizeCategory(raw) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    id: id(source.id),
    type: 'category',
    scope: oneOf(source.scope, CATEGORY_TYPES, 'task'),
    name: trimmed(source.name, 60),
    color: color(source.color),
    createdAt: isoTimestamp(source.createdAt, isoNow())
  };
}

export function sanitizeHistoryEntry(raw) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    id: id(source.id),
    type: 'history',
    reminderId: str(source.reminderId, 64),
    title: trimmed(source.title, LIMITS.title),
    firedAt: isoTimestamp(source.firedAt, isoNow()),
    action: oneOf(source.action, ['fired', 'dismissed', 'snoozed', 'missed'], 'fired')
  };
}

export const sanitizers = {
  tasks: sanitizeTask,
  events: sanitizeEvent,
  reminders: sanitizeReminder,
  notes: sanitizeNote,
  lists: sanitizeList,
  listItems: sanitizeListItem,
  categories: sanitizeCategory,
  history: sanitizeHistoryEntry
};

export const THEMES = ['system', 'light', 'dark'];
export const LANGS = ['ru', 'uk', 'en'];

export function sanitizeSettings(raw) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    theme: oneOf(source.theme, THEMES, 'system'),
    lang: oneOf(source.lang, LANGS, 'ru'),
    notifications: bool(source.notifications, true),
    weekStart: int(source.weekStart, { min: 0, max: 6, fallback: 1 }),
    defaultReminderOffset: int(source.defaultReminderOffset, { min: 0, max: 1440, fallback: 10 }),
    userName: trimmed(source.userName, 40),
    firstRunDone: bool(source.firstRunDone, false),
    updatedAt: isoTimestamp(source.updatedAt, isoNow())
  };
}
