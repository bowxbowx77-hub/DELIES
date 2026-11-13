import test from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, qs, qsa, gotoHash } from './harness.mjs';

test('app boots, renders shell and home view', async () => {
  const app = await bootApp();
  try {
    assert.ok(qs('#view').children.length > 0, 'view rendered');
    assert.equal(qsa('.nav-bar__item').length, 5);
    assert.match(qs('.hero__greeting').textContent, /Доброе|Добрый|Доброй/);
    assert.ok(qsa('.quick-action').length === 5);
  } finally {
    app.close();
  }
});

test('routes render every section', async () => {
  const app = await bootApp();
  try {
    for (const name of ['calendar', 'tasks', 'notes', 'reminders', 'shopping', 'stats', 'settings', 'home']) {
      await gotoHash(name);
      assert.ok(qs('#view').children.length > 0, `${name} rendered`);
    }
  } finally {
    app.close();
  }
});
