import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bootApp,
  qs,
  qsa,
  gotoHash,
  navByLabel,
  buttonByText,
  setInputValue,
  FakeNotification,
  flushMicrotasks
} from './harness.mjs';

const dlg = () => qsa('.dialog').at(-1);
const dlgButton = (text) => {
  const buttons = qsa('.dialog .btn', qsa('.dialog')[qsa('.dialog').length - 1]);
  return buttons.find((button) => button.textContent.trim() === text);
};
async function clickDialog(text) {
  const button = dlgButton(text);
  assert.ok(button, `dialog button "${text}" exists`);
  button.click();
  await flushMicrotasks();
  await flushMicrotasks();
}
async function openFab(app) {
  const fab = qs('.fab');
  fab.click();
  await flushMicrotasks();
  return dlg();
}

test('tasks: create, edit, complete, delete and undo', async () => {
  const app = await bootApp();
  const { ctx } = app;
  try {
    await gotoHash('tasks');
    dlg();
    await openFab(app);
    assert.ok(dlg(), 'new task dialog opened');
    setInputValue(qs('.dialog input[type="text"]'), 'Купить хлеб');
    // priority: medium
    const priorityChip = qsa('.dialog .chip').find((chip) => chip.textContent.trim() === 'Средний');
    priorityChip.click();
    await clickDialog('Сохранить');

    assert.equal(ctx.store.all('tasks').length, 1);
    const created = ctx.store.all('tasks')[0];
    assert.equal(created.title, 'Купить хлеб');
    assert.equal(created.priority, 'medium');
    assert.ok(qsa('.entity-row').some((row) => row.textContent.includes('Купить хлеб')), 'task visible');

    // edit
    qsa('.entity-row').find((row) => row.textContent.includes('Купить хлеб')).click();
    await flushMicrotasks();
    setInputValue(qs('.dialog input[type="text"]'), 'Купить хлеб и молоко');
    await clickDialog('Сохранить');
    assert.equal(ctx.store.all('tasks')[0].title, 'Купить хлеб и молоко');

    // complete through the checkbox
    qs('.entity-row .checkbox').click();
    await flushMicrotasks();
    assert.equal(ctx.store.all('tasks')[0].done, true);
    assert.equal(ctx.store.all('tasks')[0].completedAt.length > 0, true);

    // delete + undo
    const deleteButton = qsa('.entity-row').find((row) =>
      Array.from(row.querySelectorAll('button')).some((b) => b.getAttribute('aria-label') === 'Удалить')
    );
    qsa('.entity-row button[aria-label="Удалить"]')[0].click();
    await flushMicrotasks();
    await clickDialog('Удалить');
    assert.equal(ctx.store.all('tasks').length, 0);

    const undo = qs('.snackbar__action');
    assert.equal(undo.textContent.trim(), 'Отменить');
    undo.click();
    await flushMicrotasks();
    assert.equal(ctx.store.all('tasks').length, 1);
  } finally {
    app.close();
  }
});

test('tasks: search, filters and grouping', async () => {
  const app = await bootApp({
    preload: {
      tasks: [
        { id: 't1', title: 'Отчёт', due: '2000-01-01', priority: 'high' },
        { id: 't2', title: 'Позвонить маме', due: '', done: true },
        { id: 't3', title: 'Купить молоко', notes: 'в магазине у дома' }
      ]
    }
  });
  try {
    await gotoHash('tasks');
    assert.equal(qsa('.entity-row').length, 3);

    const search = qs('.search-field input');
    setInputValue(search, 'молоко');
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.equal(qsa('.entity-row').length, 1);

    setInputValue(search, 'магазине'); // matches the notes field
    await new Promise((resolve) => setTimeout(resolve, 260));
    assert.equal(qsa('.entity-row').length, 1);

    setInputValue(search, '');
    await new Promise((resolve) => setTimeout(resolve, 260));

    const chip = (label) => qsa('.chip').find((node) => node.textContent.trim() === label);
    chip('Выполненные').click();
    await flushMicrotasks();
    assert.equal(qsa('.entity-row').length, 1);
    assert.match(qs('.entity-row').textContent, /Позвонить маме/);

    chip('Просроченные').click();
    await flushMicrotasks();
    assert.equal(qsa('.entity-row').length, 1);
    assert.match(qs('.entity-row').textContent, /Отчёт/);
  } finally {
    app.close();
  }
});

test('tasks: subtasks are saved and shown as progress', async () => {
  const app = await bootApp();
  const { ctx } = app;
  try {
    await gotoHash('tasks');
    await openFab(app);
    setInputValue(qs('.dialog input[type="text"]'), 'Задача с подзадачами');
    const subtaskInput = qsa('.dialog input[type="text"]').at(-1);
    setInputValue(subtaskInput, 'Первый шаг');
    buttonByText('Добавить', dlg()).click();
    await flushMicrotasks();
    setInputValue(qs('.dialog .inline-form input'), 'Второй шаг');
    buttonByText('Добавить', dlg()).click();
    await flushMicrotasks();
    await clickDialog('Сохранить');

    const task = ctx.store.all('tasks')[0];
    assert.equal(task.subtasks.length, 2);
    assert.match(qs('.entity-row').textContent, /0\/2/);
  } finally {
    app.close();
  }
});

test('calendar: event creation, month navigation, view modes', async () => {
  const app = await bootApp();
  const { ctx } = app;
  try {
    await gotoHash('calendar');
    assert.equal(qsa('.cal-cell').length, 42);

    // Create an event through the FAB for the selected day.
    await openFab(app);
    setInputValue(qs('.dialog input[type="text"]'), 'Планёрка');
    await clickDialog('Сохранить');
    assert.equal(ctx.store.all('events').length, 1);
    assert.ok(qs('.cal-day-agenda').textContent.includes('Планёрка'), 'event in the day agenda');

    const label = qs('.cal-toolbar__label').textContent;
    qsa('.cal-toolbar .icon-btn')[1].click(); // next month
    await flushMicrotasks();
    assert.notEqual(qs('.cal-toolbar__label').textContent, label);

    // Week + day modes
    const modes = qsa('.segmented__item');
    modes.find((item) => item.textContent.trim() === 'Неделя').click();
    await flushMicrotasks();
    assert.equal(qsa('.week-strip__day').length, 7);

    modes.length = 0;
    qsa('.segmented__item').find((item) => item.textContent.trim() === 'День').click();
    await flushMicrotasks();
    assert.ok(qs('.cal-day-agenda'));
  } finally {
    app.close();
  }
});

test('calendar: recurring event appears on later dates', async () => {
  const app = await bootApp({
    preload: {
      events: [
        {
          id: 'e1',
          title: 'Тренировка',
          start: '2026-03-02',
          startTime: '18:00',
          recurrence: { freq: 'weekly', interval: 1, until: '' }
        }
      ]
    }
  });
  try {
    await gotoHash('calendar', {});
    app.window.location.hash = '#/calendar';
    await flushMicrotasks();
    const { expandOccurrences } = await import('../../main/js/core/dates.js');
    const list = expandOccurrences(
      '2026-03-02T18:00',
      { freq: 'weekly', interval: 1, until: '' },
      new Date(2026, 2, 1),
      new Date(2026, 2, 31, 23, 59)
    );
    assert.equal(list.length, 5, 'weekly occurrences in March 2026');
  } finally {
    app.close();
  }
});

test('reminders: create, schedule and fire with notification + history', async () => {
  FakeNotification.reset('granted');
  const app = await bootApp();
  const { ctx } = app;
  try {
    await gotoHash('reminders');
    assert.equal(qs('.app-bar__title').textContent, 'Напоминания');

    await openFab(app);
    setInputValue(qs('.dialog input[type="text"]'), 'Выпить воды');
    await clickDialog('Сохранить');

    const reminder = ctx.store.all('reminders')[0];
    assert.ok(reminder, 'reminder stored');
    assert.ok(reminder.at.includes('T'));

    // Simulate a due reminder and let the engine fire it.
    ctx.store.put('reminders', { ...reminder, at: '2020-01-01T10:00' });
    await flushMicrotasks();
    await ctx.reminders.tick();
    await flushMicrotasks();

    assert.equal(FakeNotification.instances.length, 1);
    assert.equal(FakeNotification.instances[0].title, 'Выпить воды');
    const history = ctx.store.all('history');
    assert.equal(history.length, 1);
    assert.equal(history[0].action, 'fired');
    assert.equal(ctx.store.all('reminders')[0].enabled, false, 'one-off reminder disabled after firing');

    await gotoHash('reminders');
    assert.ok(qs('#view').textContent.includes('Выпить воды'));
  } finally {
    app.close();
  }
});

test('reminders: toggling and next occurrence', async () => {
  const app = await bootApp({
    preload: {
      reminders: [
        {
          id: 'r1',
          title: 'Лекарство',
          at: '2026-03-02T09:00',
          recurrence: { freq: 'daily', interval: 1 },
          enabled: true
        }
      ]
    }
  });
  const { ctx } = app;
  try {
    const next = ctx.reminders.nextFor(ctx.store.all('reminders')[0], new Date(2026, 2, 5, 10, 0));
    assert.ok(next instanceof Date);
    assert.equal(next.getDate(), 6);

    await gotoHash('reminders');
    qs('.entity-row .switch').click();
    await flushMicrotasks();
    assert.equal(ctx.store.all('reminders')[0].enabled, false);
  } finally {
    app.close();
  }
});

test('notes: create, pin, search and delete', async () => {
  const app = await bootApp();
  const { ctx } = app;
  try {
    await gotoHash('notes');
    await openFab(app);
    setInputValue(qs('.dialog input[type="text"]'), 'Идея приложения');
    const textarea = qs('.dialog textarea');
    setInputValue(textarea, 'Сделать помощник DELIES');
    await clickDialog('Сохранить');

    assert.equal(ctx.store.all('notes').length, 1);
    assert.ok(qs('#view').textContent.includes('Идея приложения'));

    // pin
    qs('.note-card button[aria-label="Закрепить"]').click();
    await flushMicrotasks();
    assert.equal(ctx.store.all('notes')[0].pinned, true);
    assert.ok(qs('.section-title').textContent.includes('Закреплённые'));

    // search
    const search = qs('.search-field input');
    setInputValue(search, 'несуществующая');
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(qsa('.note-card').length, 0);

    setInputValue(search, 'DELIES');
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(qsa('.note-card').length, 1);

    // delete
    qs('.note-card button[aria-label="Удалить"]').click();
    await flushMicrotasks();
    await clickDialog('Удалить');
    assert.equal(ctx.store.all('notes').length, 0);
  } finally {
    app.close();
  }
});

test('shopping: list, items, quantity, progress and cleanup', async () => {
  const app = await bootApp();
  const { ctx } = app;
  try {
    await gotoHash('shopping');
    await openFab(app);
    setInputValue(qs('.dialog input[type="text"]'), 'Продукты');
    await clickDialog('Сохранить');
    assert.equal(ctx.store.all('lists').length, 1);
    const list = ctx.store.all('lists')[0];

    // inline add
    const itemInput = qs('.search-field input');
    setInputValue(itemInput, 'Молоко');
    buttonByText('Добавить товар').click();
    await flushMicrotasks();
    setInputValue(qs('.search-field input'), 'Хлеб');
    buttonByText('Добавить товар').click();
    await flushMicrotasks();

    const items = ctx.store.find('listItems', (item) => item.listId === list.id);
    assert.equal(items.length, 2);
    assert.ok(qs('#view').textContent.includes('Молоко'));

    // check first item
    qs('.shop-item .checkbox').click();
    await flushMicrotasks();
    const doneItems = ctx.store.find('listItems', (item) => item.listId === list.id && item.done);
    assert.equal(doneItems.length, 1);

    // quantity stepper
    qsa('.qty-stepper .icon-btn')[1].click();
    await flushMicrotasks();
    const quantities = ctx.store.all('listItems').map((item) => item.qty);
    assert.ok(quantities.includes(2), `a quantity was incremented: ${quantities}`);

    // clear bought
    buttonByText('Убрать купленные').click();
    await flushMicrotasks();
    await clickDialog('Подтвердить');
    assert.equal(ctx.store.find('listItems', (item) => item.done).length, 0);
  } finally {
    app.close();
  }
});

test('shopping: deleting a list removes its items', async () => {
  const app = await bootApp({
    preload: {
      lists: [{ id: 'l1', title: 'Дом' }],
      listItems: [
        { id: 'i1', listId: 'l1', title: 'Мыло', qty: 1 },
        { id: 'i2', listId: 'l1', title: 'Губка', qty: 2 }
      ]
    }
  });
  const { ctx } = app;
  try {
    await gotoHash('shopping');
    qs('.card__header button[aria-label="Удалить список"]').click();
    await flushMicrotasks();
    await clickDialog('Удалить');
    assert.equal(ctx.store.all('lists').length, 0);
    assert.equal(ctx.store.all('listItems').length, 0);
  } finally {
    app.close();
  }
});

test('statistics reflect the data', async () => {
  const app = await bootApp({
    preload: {
      tasks: [
        { id: 's1', title: 'A', done: true, completedAt: new Date().toISOString(), due: '2026-01-01' },
        { id: 's2', title: 'B', due: '2000-01-01' },
        { id: 's3', title: 'C' }
      ],
      notes: [{ id: 'n1', title: 'N', body: 'x' }]
    }
  });
  try {
    await gotoHash('stats');
    const values = qsa('.metric-card__value').map((node) => node.textContent);
    assert.equal(values[0], '3'); // total
    assert.equal(values[1], '1'); // done
    assert.equal(values[2], '1'); // overdue
    assert.equal(values[3], '2'); // active
    assert.equal(values[4], '33%'); // completion
    assert.ok(qsa('.bar-chart__col').length === 7);
    assert.ok(qsa('.activity-heat__cell').length === 30);
  } finally {
    app.close();
  }
});

test('persistence: data survives an app restart', async () => {
  const first = await bootApp();
  try {
    first.ctx.store.put('tasks', { id: 'persist-1', title: 'Сохрани меня', due: '2030-01-01' });
    await first.ctx.store.flush();
  } finally {
    first.close();
  }

  const { openStore } = await import('../../main/js/core/store.js');
  const { store } = await openStore({});
  assert.equal(store.all('tasks').length, 1);
  assert.equal(store.all('tasks')[0].title, 'Сохрани меня');
});

test('backup: export → wipe → import restores everything', async () => {
  const app = await bootApp({
    preload: {
      tasks: [{ id: 'b1', title: 'Задача из бэкапа', priority: 'high' }],
      notes: [{ id: 'b2', title: 'Заметка', body: 'текст' }]
    }
  });
  const { ctx } = app;
  try {
    const { exportData, applyImport } = await import('../../main/js/views/settings.js');
    let savedText = null;
    ctx.platform.saveTextFile = async (name, content) => {
      savedText = content;
      return { ok: true };
    };
    assert.equal(await exportData(ctx), true);
    assert.ok(savedText && savedText.includes('DELIES'));
    const parsed = JSON.parse(savedText);
    assert.equal(parsed.app, 'DELIES');
    assert.equal(parsed.data.tasks.length, 1);

    await ctx.store.clearAll();
    assert.equal(ctx.store.all('tasks').length, 0);

    assert.equal(await applyImport(ctx, savedText), true);
    assert.equal(ctx.store.all('tasks').length, 1);
    assert.equal(ctx.store.all('notes').length, 1);

    // corrupt files must be rejected
    assert.equal(await applyImport(ctx, '{not json'), false);
    assert.equal(await applyImport(ctx, JSON.stringify({ app: 'OTHER', data: {} })), false);
  } finally {
    app.close();
  }
});

test('settings: theme and language switches apply immediately', async () => {
  const app = await bootApp();
  const { ctx, document } = app;
  try {
    await gotoHash('settings');

    const lightButton = qsa('.segmented__item').find((item) => item.textContent.trim() === 'Светлая');
    lightButton.click();
    await flushMicrotasks();
    assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
    assert.equal(ctx.settings.theme, 'light');

    const darkButton = qsa('.segmented__item').find((item) => item.textContent.trim() === 'Тёмная');
    darkButton.click();
    await flushMicrotasks();
    assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');

    const langSelect = qs('select');
    langSelect.value = 'en';
    langSelect.dispatchEvent(new app.window.Event('change', { bubbles: true }));
    await flushMicrotasks();
    assert.equal(ctx.getLang(), 'en');
    assert.equal(qsa('.nav-bar__label')[2].textContent, 'Tasks');
    assert.equal(qs('.app-bar__title').textContent, 'Settings');

    ctx.settings = { ...ctx.settings, lang: 'ru' };
    await ctx.updateSettings({ lang: 'ru' });
    await flushMicrotasks();
    assert.equal(qsa('.nav-bar__label')[2].textContent, 'Задачи');
  } finally {
    app.close();
  }
});

test('settings: name is used in the greeting', async () => {
  const app = await bootApp();
  const { ctx } = app;
  try {
    await ctx.updateSettings({ userName: 'Алексей' });
    await gotoHash('home');
    assert.ok(qs('.hero__greeting').textContent.includes('Алексей'));
  } finally {
    app.close();
  }
});

test('first run seeds categories and shows the welcome dialog', async () => {
  const app = await bootApp({ seedSettings: false });
  const { ctx } = app;
  try {
    assert.ok(ctx.store.all('categories').length >= 9);
    assert.ok(qsa('.dialog').length >= 1, 'welcome dialog shown');
    const welcomeButton = qsa('.dialog')[0].querySelector('.btn');
    assert.ok(welcomeButton, 'welcome dialog has a confirmation button');
    welcomeButton.click();
    await flushMicrotasks();
    await flushMicrotasks();
    assert.equal(ctx.settings.firstRunDone, true);
  } finally {
    app.close();
  }
});

test('invalid stored data is sanitised instead of breaking the app', async () => {
  const app = await bootApp({
    preload: {
      tasks: [
        { id: 'bad 1', title: '<script>alert(1)</script>', bogus: true, due: 'not-a-date', priority: 'urgent' },
        'not an object',
        null
      ]
    }
  });
  const { ctx } = app;
  try {
    const tasks = ctx.store.all('tasks');
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, '<script>alert(1)</script>');
    assert.equal(tasks[0].priority, 'none');
    assert.equal(tasks[0].due, '');
    await gotoHash('tasks');
    // The title must be rendered as text, never as markup.
    assert.equal(qsa('.entity-row__title script').length, 0);
    assert.ok(qs('.entity-row__title').textContent.includes('<script>'));
  } finally {
    app.close();
  }
});

test('navigation: back button and overlays', async () => {
  const app = await bootApp();
  const { ctx } = app;
  try {
    await gotoHash('notes');
    await openFab(app);
    assert.ok(qsa('.dialog').length > 0);
    const handled = ctx.platform.handleHardwareBack();
    assert.equal(handled, true, 'back closes the dialog first');
    assert.equal(qsa('.dialog').length, 0);
  } finally {
    app.close();
  }
});
