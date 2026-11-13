/** Home: greeting, clock, day progress, events, tasks, next reminders. */

import { h } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';
import {
  formatDate,
  formatTime,
  todayKey,
  isSameDay,
  expandOccurrences,
  parseLocal,
  startOfDay,
  endOfDay
} from '../core/dates.js';
import { taskRow, eventRow, reminderRow, sortTasks } from './shared.js';
import { emptyState, primaryButton } from '../ui/controls.js';
import { openTaskDialog, openEventDialog, openReminderDialog, openNoteDialog, openListDialog } from '../ui/forms.js';

function greetingKey(hour) {
  if (hour < 5) return 'home.greetingNight';
  if (hour < 12) return 'home.greetingMorning';
  if (hour < 18) return 'home.greetingDay';
  return 'home.greetingEvening';
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function progressRing(percent, label) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, percent));
  const offset = circumference * (1 - clamped);

  const svg = svgEl('svg', { viewBox: '0 0 80 80', 'aria-hidden': 'true' });
  svg.appendChild(svgEl('circle', { class: 'ring__track', cx: 40, cy: 40, r: radius }));
  const value = svgEl('circle', {
    class: 'ring__value',
    cx: 40,
    cy: 40,
    r: radius,
    'stroke-dasharray': circumference.toFixed(1),
    'stroke-dashoffset': offset.toFixed(1)
  });
  svg.appendChild(value);

  const wrapper = h('div.ring', { role: 'img', 'aria-label': `${Math.round(clamped * 100)}%` });
  wrapper.appendChild(svg);
  wrapper.appendChild(h('div.ring__center', { text: label }));
  return wrapper;
}

export default function homeView(ctx) {
  let clockEl = null;
  let clockTimer = 0;
  let root = null;

  function todayTasks() {
    const today = todayKey();
    return ctx.store.find('tasks', (task) => task.due === today);
  }

  function todayEvents() {
    const from = startOfDay(new Date());
    const to = endOfDay(new Date());
    const items = [];
    ctx.store.all('events').forEach((event) => {
      expandOccurrences(`${event.start}T${event.startTime || '00:00'}`, event.recurrence, addDaysSafe(from, -1), to).forEach((occ) => {
        if (isSameDay(occ.date, new Date())) items.push({ event, date: occ.date });
      });
    });
    return items.sort((a, b) => {
      if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1;
      return (a.event.startTime || '').localeCompare(b.event.startTime || '');
    });
  }

  function addDaysSafe(date, days) {
    const copy = new Date(date.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function upcomingReminders() {
    const now = new Date();
    return ctx.store
      .all('reminders')
      .filter((reminder) => reminder.enabled)
      .map((reminder) => ({ reminder, next: ctx.reminders.nextFor(reminder, now) }))
      .filter((entry) => entry.next)
      .sort((a, b) => a.next - b.next)
      .slice(0, 3);
  }

  function renderClock() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.replaceChildren(
      h('span', { text: formatTime(now, ctx.getLang()) }),
      h('small', { text: formatDate(now, ctx.getLang(), { weekday: 'long', day: 'numeric', month: 'long' }) })
    );
  }

  function render() {
    const lang = ctx.getLang();
    const now = new Date();
    const tasks = todayTasks();
    const doneCount = tasks.filter((task) => task.done).length;
    const total = tasks.length;
    const percent = total ? doneCount / total : 0;
    const name = ctx.settings.userName ? `, ${ctx.settings.userName}` : '';

    const openTasks = ctx.store.count('tasks', (task) => !task.done);
    const globalDone = ctx.store.count('tasks', (task) => task.done);
    const overdue = ctx.store.count('tasks', (task) => !task.done && task.due && task.due < todayKey());

    clockEl = h('div.hero__clock');

    const hero = h(
      'section.hero',
      null,
      h('p.hero__greeting', { text: `${t(greetingKey(now.getHours()))}${name}` }),
      h('h2.hero__name', { text: ctx.settings.userName ? ctx.settings.userName : t('app.name') }),
      h('p.hero__date', { text: formatDate(now, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }),
      clockEl
    );

    const progress = h(
      'section.card',
      null,
      h(
        'div.day-progress',
        null,
        progressRing(percent, `${doneCount}/${total}`),
        h(
          'div.day-progress__text',
          null,
          h('div.day-progress__title', { text: t('home.progressTitle') }),
          h('div.day-progress__meta', {
            text: total ? t('home.progressMeta', { done: doneCount, total }) : t('home.progressEmpty')
          })
        )
      )
    );

    const stats = h(
      'div.stat-strip',
      null,
      h('div.stat-tile', null, h('div.stat-tile__value', { text: String(openTasks) }), h('div.stat-tile__label', { text: t('home.statOpen') })),
      h('div.stat-tile', null, h('div.stat-tile__value', { text: String(globalDone) }), h('div.stat-tile__label', { text: t('home.statDone') })),
      h(
        'div.stat-tile',
        null,
        h('div.stat-tile__value', { text: String(overdue) }),
        h('div.stat-tile__label', { text: t('home.statOverdue') })
      )
    );

    const quick = [
      { icon: 'tasks', label: t('home.quickTask'), onClick: () => openTaskDialog(ctx, { defaults: { due: todayKey() } }) },
      { icon: 'calendar', label: t('home.quickEvent'), onClick: () => openEventDialog(ctx, { date: todayKey() }) },
      { icon: 'bell', label: t('home.quickReminder'), onClick: () => openReminderDialog(ctx) },
      { icon: 'note', label: t('home.quickNote'), onClick: () => openNoteDialog(ctx) },
      { icon: 'cart', label: t('home.quickShopping'), onClick: () => openListDialog(ctx) }
    ];

    const quickGrid = h(
      'div.quick-grid',
      null,
      ...quick.map((action) =>
        h(
          'button.quick-action',
          { type: 'button', on: { click: action.onClick } },
          h('span.quick-action__icon', null, iconNode(action.icon)),
          h('span.quick-action__label', { text: action.label })
        )
      )
    );

    const events = todayEvents();
    const eventsSection = h(
      'section',
      null,
      h('h2.section-title', null, h('span', { text: t('home.eventsToday') }),
        h('button.section-title__action', { type: 'button', on: { click: () => ctx.navigate('calendar') } }, t('common.more'))),
      events.length
        ? h('div.list', null, ...events.slice(0, 5).map((entry) => eventRow(ctx, entry.event, entry.date, (event) => openEventDialog(ctx, { event }))))
        : h('div.card.card--flat', null, h('p.card__body', { text: t('home.noEvents') }))
    );

    const tasksSection = h(
      'section',
      null,
      h('h2.section-title', null, h('span', { text: t('home.tasksToday') }),
        h('button.section-title__action', { type: 'button', on: { click: () => ctx.navigate('tasks') } }, t('common.more'))),
      tasks.length
        ? h('div.list', null, ...sortTasks(tasks).slice(0, 6).map((task) => taskRow(ctx, task, { showDate: false, onEdit: (item) => openTaskDialog(ctx, { task: item }) })))
        : h('div.card.card--flat', null, h('p.card__body', { text: t('home.noTasks') }),
            primaryButton(t('tasks.new'), () => openTaskDialog(ctx, { defaults: { due: todayKey() } }), { variant: 'tonal', icon: 'plus', block: true }))
    );

    const upcoming = upcomingReminders();
    const remindersSection = h(
      'section',
      null,
      h('h2.section-title', null, h('span', { text: t('home.remindersNext') }),
        h('button.section-title__action', { type: 'button', on: { click: () => ctx.navigate('reminders') } }, t('common.more'))),
      upcoming.length
        ? h(
            'div.list',
            null,
            ...upcoming.map(({ reminder, next }) =>
              h(
                'button.entity-row',
                { type: 'button', on: { click: () => openReminderDialog(ctx, { reminder }) } },
                h('span.list-item__leading', null, iconNode('bell')),
                h(
                  'div.entity-row__main',
                  null,
                  h('div.entity-row__title', { text: reminder.title }),
                  h('div.entity-row__meta', null, h('span', { text: `${formatDate(next, lang, { day: 'numeric', month: 'short' })}, ${formatTime(next, lang)}` }))
                )
              )
            )
          )
        : h('div.card.card--flat', null, h('p.card__body', { text: t('home.noReminders') }))
    );

    root = h(
      'div.stack',
      null,
      hero,
      progress,
      stats,
      h('h2.section-title', null, h('span', { text: t('home.quickActions') })),
      quickGrid,
      eventsSection,
      tasksSection,
      remindersSection
    );
    renderClock();
    return root;
  }

  return {
    render,
    onMount() {
      renderClock();
      clockTimer = setInterval(renderClock, 20000);
    },
    onDestroy() {
      if (clockTimer) clearInterval(clockTimer);
      clockTimer = 0;
    },
    appBarActions() {
      return [
        h('button.icon-btn.icon-btn--sm', {
          type: 'button',
          'aria-label': t('nav.settings'),
          title: t('nav.settings'),
          on: { click: () => ctx.navigate('settings') }
        }, iconNode('settings'))
      ];
    }
  };
}
