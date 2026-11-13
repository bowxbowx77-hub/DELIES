import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  toDateKey,
  parseLocal,
  addDays,
  addMonths,
  monthMatrix,
  weekDays,
  nextOccurrence,
  expandOccurrences,
  startOfWeek,
  isSameDay,
  toDateTimeInput
} from '../../main/js/core/dates.js';
import {
  sanitizeTask,
  sanitizeSettings,
  sanitizeReminder,
  dateKey,
  dateTime,
  recurrence,
  trimmed,
  str,
  id
} from '../../main/js/core/validate.js';
import { parseBackup, serializeBackup, buildBackup } from '../../main/js/core/backup.js';
import { t, setLang, DICTIONARIES, allKeys } from '../../main/js/core/i18n.js';
import { Store, MemoryAdapter } from '../../main/js/core/store.js';

test('dates: parsing, formatting and calendar grids', () => {
  const date = parseLocal('2026-03-02T18:30');
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 2);
  assert.equal(date.getDate(), 2);
  assert.equal(date.getHours(), 18);
  assert.equal(toDateKey(date), '2026-03-02');
  assert.equal(toDateTimeInput(date), '2026-03-02T18:30');

  assert.equal(parseLocal('garbage'), null);
  assert.equal(parseLocal(''), null);

  assert.equal(toDateKey(addDays(new Date(2026, 0, 31), 1)), '2026-02-01');
  assert.equal(toDateKey(addMonths(new Date(2026, 0, 15), 1, true)), '2026-02-15');

  assert.equal(monthMatrix(new Date(2026, 2, 1), 1).length, 42);
  assert.equal(weekDays(new Date(2026, 2, 4), 1).length, 7);
  assert.equal(toDateKey(startOfWeek(new Date(2026, 2, 4), 1)), '2026-03-02');
  assert.ok(isSameDay(new Date(2026, 2, 4, 23, 59), new Date(2026, 2, 4, 0, 1)));
});

test('dates: recurrence never drifts on month ends', () => {
  const base = '2026-01-31T09:00';
  const keys = [];
  let cursor = parseLocal(base);
  for (let i = 0; i < 4; i += 1) {
    const next = nextOccurrence(base, { freq: 'monthly', interval: 1 }, cursor);
    keys.push(toDateKey(next));
    cursor = next;
  }
  assert.deepEqual(keys, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
});

test('dates: recurrence frequencies and end dates', () => {
  const after = parseLocal('2026-03-02T10:00');
  assert.equal(toDateKey(nextOccurrence('2026-03-02T10:00', { freq: 'daily', interval: 1 }, after)), '2026-03-03');
  assert.equal(toDateKey(nextOccurrence('2026-03-02T10:00', { freq: 'weekly', interval: 2 }, after)), '2026-03-16');
  assert.equal(toDateKey(nextOccurrence('2026-03-02T10:00', { freq: 'yearly', interval: 1 }, after)), '2027-03-02');
  assert.equal(nextOccurrence('2026-03-02T10:00', { freq: 'daily', until: '2026-03-04' }, parseLocal('2026-03-05T00:00')), null);
  assert.equal(nextOccurrence('2026-03-02T10:00', { freq: 'none' }, after), null, 'one-off in the past has no next');

  const list = expandOccurrences(
    '2026-03-01T08:00',
    { freq: 'daily', interval: 1 },
    parseLocal('2026-03-01'),
    parseLocal('2026-03-05T23:59')
  );
  assert.equal(list.length, 5);
});

test('validation: hostile and corrupted input is normalised', () => {
  const task = sanitizeTask({
    id: '../../etc/passwd',
    title: '  Задача  ',
    notes: 'a\u0000b',
    priority: 'ultra',
    due: '2026-02-30',
    subtasks: [{ id: 'x', title: ' ok ', done: 'true' }, { title: '' }]
  });
  assert.match(task.id, /^[A-Za-z0-9_-]+$/);
  assert.equal(task.title, 'Задача');
  assert.equal(task.notes, 'ab');
  assert.equal(task.priority, 'none');
  assert.equal(task.due, '');
  assert.equal(task.subtasks.length, 1);
  assert.equal(task.subtasks[0].done, true);

  assert.equal(dateKey('2026-13-01'), '');
  assert.equal(dateKey('2026-02-28'), '2026-02-28');
  assert.equal(dateTime('2026-03-02T25:00'), '');
  assert.equal(dateTime('2026-03-02T23:59'), '2026-03-02T23:59');
  assert.deepEqual(recurrence({ freq: 'hourly', interval: 999 }), { freq: 'none', interval: 99, until: '' });
  assert.equal(trimmed('x'.repeat(500)).length, 200);
  assert.equal(str(null), '');
  assert.equal(id('ok-id_1'), 'ok-id_1');
  assert.notEqual(id('bad id!'), 'bad id!');

  const reminder = sanitizeReminder({ title: 'R', at: '2026-03-02T09:00', enabled: 'true' });
  assert.equal(reminder.enabled, true);
  assert.equal(reminder.at, '2026-03-02T09:00');

  const settings = sanitizeSettings({ theme: 'neon', lang: 'de', weekStart: 99, notifications: 'false' });
  assert.equal(settings.theme, 'system');
  assert.equal(settings.lang, 'ru');
  assert.equal(settings.weekStart, 6);
  assert.equal(settings.notifications, false);
});

test('backup: strict validation of imported files', () => {
  const store = new Store(new MemoryAdapter());
  const snapshot = buildBackup(store);
  assert.equal(snapshot.app, 'DELIES');
  const text = serializeBackup(snapshot);

  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);

  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup('[]').ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: 'X', data: {} })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: 'DELIES', data: {}, schema: 99 })).ok, false);
  assert.equal(parseBackup('x'.repeat(6 * 1024 * 1024)).ok, false);

  const partial = parseBackup(
    JSON.stringify({ app: 'DELIES', schema: 1, data: { tasks: [{ id: 'a1', title: 'T' }, 'junk', null] } })
  );
  assert.equal(partial.ok, true);
  assert.equal(partial.data.tasks.length, 1);
  assert.equal(partial.data.notes.length, 0);
});

test('store: cache, events, snapshot and replaceAll', async () => {
  const store = new Store(new MemoryAdapter());
  await store.open();
  const events = [];
  store.subscribe((event) => events.push(event.action));

  const created = store.put('tasks', { id: 't1', title: 'Первая' });
  assert.equal(created.title, 'Первая');
  store.put('tasks', { id: 't1', title: 'Обновлённая' });
  assert.equal(store.get('tasks', 't1').title, 'Обновлённая');
  assert.equal(store.all('tasks').length, 1);

  store.remove('tasks', 't1');
  assert.equal(store.all('tasks').length, 0);
  assert.deepEqual(events, ['create', 'update', 'delete']);

  store.put('notes', { id: 'n1', title: 'N' });
  const snapshot = store.snapshot();
  assert.equal(snapshot.data.notes.length, 1);

  await store.replaceAll({ tasks: [{ id: 't2', title: 'Импорт' }] }, null);
  assert.equal(store.all('tasks').length, 1);
  assert.equal(store.all('notes').length, 0);
  await store.flush();
});

test('i18n: every language defines every key and placeholders work', () => {
  const keys = allKeys();
  assert.ok(keys.length > 100, `expected a full dictionary, got ${keys.length} keys`);
  for (const lang of ['ru', 'uk', 'en']) {
    const missing = keys.filter((key) => DICTIONARIES[lang][key] === undefined);
    assert.deepEqual(missing, [], `${lang} is missing: ${missing.join(', ')}`);
  }
  setLang('ru');
  assert.equal(t('tasks.title'), 'Задачи');
  assert.equal(t('home.progressMeta', { done: 2, total: 5 }), 'Выполнено 2 из 5 задач');
  setLang('en');
  assert.equal(t('tasks.title'), 'Tasks');
  assert.equal(t('unknown.key'), 'unknown.key');
  setLang('ru');
});

test('dom helpers: text is never parsed as markup', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  try {
    const { h } = await import('../../main/js/core/dom.js');
    const evil = '<img src=x onerror=alert(1)>';
    const node = h('div.card', { text: evil }, h('span', null, evil));
    globalThis.document.getElementById('root').appendChild(node);
    assert.equal(node.querySelectorAll('img').length, 0);
    assert.equal(node.textContent, evil + evil);
  } finally {
    globalThis.document = previous;
  }
});
