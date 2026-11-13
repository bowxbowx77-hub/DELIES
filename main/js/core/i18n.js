import ru from '../data/locales/ru.js';
import uk from '../data/locales/uk.js';
import en from '../data/locales/en.js';

export const DICTIONARIES = { ru, uk, en };
export const LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
  { code: 'en', label: 'English' }
];

let currentLang = 'ru';
const listeners = new Set();

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  const next = DICTIONARIES[lang] ? lang : 'ru';
  if (next === currentLang) return currentLang;
  currentLang = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  listeners.forEach((fn) => fn(next));
  return currentLang;
}

export function onLangChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Translate a key. `{name}` placeholders are replaced from `params`.
 * Falls back to Russian, then to the key itself so a missing string is visible
 * instead of undefined.
 */
export function t(key, params) {
  const dict = DICTIONARIES[currentLang] || DICTIONARIES.ru;
  let text = dict[key];
  if (text === undefined) text = DICTIONARIES.ru[key];
  if (text === undefined) text = key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

/** Applies translations to elements with data-i18n / data-i18n-placeholder. */
export function translateStatic(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  scope.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
  });
}

export function formatNumber(value, lang) {
  try {
    return new Intl.NumberFormat(lang || currentLang).format(value);
  } catch {
    return String(value);
  }
}

/** Every key present in any dictionary — used by the locale parity test. */
export function allKeys() {
  const keys = new Set();
  Object.values(DICTIONARIES).forEach((dict) => Object.keys(dict).forEach((k) => keys.add(k)));
  return Array.from(keys).sort();
}
