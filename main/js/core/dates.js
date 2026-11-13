/**
 * Date/time helpers. Everything works in the user's local timezone and uses
 * plain `Date` objects plus ISO-like local strings ("YYYY-MM-DDTHH:mm").
 * Intl is used for locale formatting; a manual formatter is the fallback for
 * very old engines.
 */

export const MS_MINUTE = 60 * 1000;
export const MS_HOUR = 60 * MS_MINUTE;
export const MS_DAY = 24 * MS_HOUR;

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "YYYY-MM-DDTHH:mm" — value format used by <input type="datetime-local">. */
export function toDateTimeInput(date) {
  return `${toDateKey(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function toTimeInput(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Parses "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm[:ss]" as *local* time. */
export function parseLocal(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value !== 'string' || !value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (!match) return null;
  const [, y, mo, d, hh, mm, ss] = match;
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    hh === undefined ? 0 : Number(hh),
    mm === undefined ? 0 : Number(mm),
    ss === undefined ? 0 : Number(ss)
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local date key of the current day (YYYY-MM-DD). */
export function todayKey() {
  return toDateKey(new Date());
}

export function startOfDay(value) {
  const d = parseLocal(value) || new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(value) {
  const d = startOfDay(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(value, amount) {
  const d = parseLocal(value) || new Date();
  d.setDate(d.getDate() + amount);
  return d;
}

export function addMinutes(value, amount) {
  const d = parseLocal(value) || new Date();
  d.setMinutes(d.getMinutes() + amount);
  return d;
}

export function addMonths(value, amount, keepDay = false) {
  const d = parseLocal(value) || new Date();
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + amount);
  const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(keepDay ? Math.min(day, maxDay) : 1);
  return d;
}

export function startOfWeek(value, weekStart = 1) {
  const d = startOfDay(value);
  const day = d.getDay();
  const diff = (day - weekStart + 7) % 7;
  return addDays(d, -diff);
}

export function endOfWeek(value, weekStart = 1) {
  return endOfDay(addDays(startOfWeek(value, weekStart), 6));
}

export function startOfMonth(value) {
  const d = startOfDay(value);
  d.setDate(1);
  return d;
}

export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function isSameDay(a, b) {
  const da = parseLocal(a);
  const db = parseLocal(b);
  if (!da || !db) return false;
  return (
    da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
  );
}

export function isToday(value) {
  return isSameDay(value, new Date());
}

export function isBetween(value, from, to) {
  const v = (parseLocal(value) || new Date()).getTime();
  return v >= from.getTime() && v <= to.getTime();
}

export function clampDate(value, min, max) {
  const d = parseLocal(value);
  if (!d) return null;
  if (min && d < min) return new Date(min.getTime());
  if (max && d > max) return new Date(max.getTime());
  return d;
}

/** 6x7 matrix of dates covering the month view. */
export function monthMatrix(value, weekStart = 1) {
  const first = startOfMonth(value);
  const gridStart = startOfWeek(first, weekStart);
  const cells = [];
  for (let i = 0; i < 42; i += 1) cells.push(addDays(gridStart, i));
  return cells;
}

export function weekDays(value, weekStart = 1) {
  const first = startOfWeek(value, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

const LOCALES = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US' };

export function localeOf(lang) {
  return LOCALES[lang] || LOCALES.ru;
}

function intlFormat(date, lang, options) {
  try {
    return new Intl.DateTimeFormat(localeOf(lang), options).format(date);
  } catch {
    return null;
  }
}

export function formatDate(value, lang = 'ru', options) {
  const d = parseLocal(value);
  if (!d) return '';
  const opts = options || { day: 'numeric', month: 'long', year: 'numeric' };
  return intlFormat(d, lang, opts) || `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function formatMonthYear(value, lang = 'ru') {
  const d = parseLocal(value);
  if (!d) return '';
  return intlFormat(d, lang, { month: 'long', year: 'numeric' }) || `${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function formatTime(value, lang = 'ru') {
  const d = parseLocal(value);
  if (!d) return '';
  return intlFormat(d, lang, { hour: '2-digit', minute: '2-digit' }) || `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatWeekdayShort(value, lang = 'ru') {
  const d = parseLocal(value);
  if (!d) return '';
  return intlFormat(d, lang, { weekday: 'short' }) || '';
}

export function formatWeekdayNarrow(value, lang = 'ru') {
  const d = parseLocal(value);
  if (!d) return '';
  return intlFormat(d, lang, { weekday: 'narrow' }) || '';
}

export function formatDateTime(value, lang = 'ru') {
  return `${formatDate(value, lang, { day: 'numeric', month: 'short' })} ${formatTime(value, lang)}`;
}

/** Relative label for a day: "Сегодня", "Завтра", else locale date. */
export function relativeDay(value, lang = 'ru', labels) {
  const d = startOfDay(value);
  const today = startOfDay(new Date());
  const diff = Math.round((d.getTime() - today.getTime()) / MS_DAY);
  if (labels) {
    if (diff === 0) return labels.today;
    if (diff === 1) return labels.tomorrow;
    if (diff === -1) return labels.yesterday;
  }
  return formatDate(d, lang, { day: 'numeric', month: 'short', weekday: 'short' });
}

export function startOfToday() {
  return startOfDay(new Date());
}

/** Minutes since midnight. */
export function minutesOfDay(value) {
  const d = parseLocal(value) || new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function pluralMinutes(minutes, words) {
  if (minutes < 60) return words.minutes.replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourText = words.hours.replace('{n}', String(hours));
  return rest ? `${hourText} ${words.minutes.replace('{n}', String(rest))}` : hourText;
}

/** Shifts `base` by `k` recurrence steps without day-of-month drift. */
export function shiftOccurrence(baseValue, recurrence, k) {
  const base = parseLocal(baseValue);
  if (!base) return null;
  const freq = recurrence && recurrence.freq ? recurrence.freq : 'none';
  const interval = Math.max(1, Math.min(99, Number(recurrence && recurrence.interval) || 1));
  const steps = Math.max(0, Number(k) || 0);
  if (freq === 'none') return steps === 0 ? new Date(base.getTime()) : null;
  if (freq === 'daily') return addDays(base, interval * steps);
  if (freq === 'weekly') return addDays(base, 7 * interval * steps);
  if (freq === 'monthly') {
    const d = new Date(base.getTime());
    d.setDate(1);
    d.setMonth(base.getMonth() + interval * steps);
    const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(base.getDate(), maxDay));
    return d;
  }
  if (freq === 'yearly') {
    const d = new Date(base.getTime());
    d.setFullYear(base.getFullYear() + interval * steps);
    return d;
  }
  return null;
}

/**
 * Next occurrence of a repeating date strictly after `after`.
 * `recurrence` = { freq: 'none'|'daily'|'weekly'|'monthly'|'yearly', interval?: number, until?: 'YYYY-MM-DD' }
 * Returns a Date or null when the series has ended.
 */
export function nextOccurrence(baseValue, recurrence, after) {
  const base = parseLocal(baseValue);
  if (!base) return null;
  const freq = recurrence && recurrence.freq ? recurrence.freq : 'none';
  const afterTime = after ? (parseLocal(after) || new Date()).getTime() : Date.now();
  const until = recurrence && recurrence.until ? endOfDay(recurrence.until) : null;
  if (freq === 'none') return base.getTime() > afterTime ? base : null;
  let k = 0;
  for (; k < 4000; k += 1) {
    const candidate = shiftOccurrence(base, recurrence, k);
    if (!candidate) return null;
    if (candidate.getTime() > afterTime) {
      if (until && candidate.getTime() > until.getTime()) return null;
      return candidate;
    }
  }
  return null;
}

/**
 * All occurrences of a (possibly repeating) event within [from, to].
 * Returns array of { date, index } sorted ascending.
 */
export function expandOccurrences(startValue, recurrence, from, to) {
  const base = parseLocal(startValue);
  if (!base) return [];
  const freq = recurrence && recurrence.freq ? recurrence.freq : 'none';
  const until = recurrence && recurrence.until ? endOfDay(recurrence.until) : null;
  const results = [];
  if (freq === 'none') {
    if (base >= from && base <= to) results.push({ date: base, index: 0 });
    return results;
  }
  for (let k = 0; k < 2000; k += 1) {
    const candidate = shiftOccurrence(base, recurrence, k);
    if (!candidate) break;
    if (candidate > to) break;
    if (until && candidate > until) break;
    if (candidate >= from) results.push({ date: candidate, index: k });
  }
  return results;
}

export function humanRecurrence(recurrence, t) {
  if (!recurrence || !recurrence.freq || recurrence.freq === 'none') return t('recurrence.none');
  const interval = Math.max(1, Number(recurrence.interval) || 1);
  const key = `recurrence.${recurrence.freq}${interval > 1 ? 'N' : ''}`;
  return t(key, { n: interval });
}
