/** Row renderers shared by several views. */

import { h } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { formatDate, formatTime, todayKey, parseLocal, formatWeekdayShort } from '../core/dates.js';
import { PRIORITY_ORDER } from '../data/defaults.js';
import { isoNow } from '../core/validate.js';

export function categoryDot(ctx, categoryId, extraText) {
  const category = ctx.categoryById(categoryId);
  if (!category) return extraText ? h('span.muted', { text: extraText }) : null;
  return h(
    'span.meta-dot',
    { style: { '--dot-color': `var(--label-${category.color})` }, title: category.name },
    h('span', { text: extraText || category.name })
  );
}

export function priorityFlag(priority) {
  if (!priority || priority === 'none') return null;
  return h(`span.priority-flag.priority-flag--${priority}`, null, iconNode('flag'), h('span', { text: t(`priority.${priority}`) }));
}

export function dueLabel(task, lang) {
  if (!task.due) return null;
  const today = todayKey();
  const isOverdue = !task.done && task.due < today;
  const text =
    task.due === today
      ? t('tasks.dueToday')
      : task.due === todayKey(new Date(Date.now() + 86400000))
        ? t('tasks.dueTomorrow')
        : formatDate(task.due, lang, { day: 'numeric', month: 'short' });
  const withTime = task.dueTime ? `${text}, ${task.dueTime}` : text;
  return h(
    'span' + (isOverdue ? '.overdue' : ''),
    { title: task.due },
    iconNode('calendar'),
    h('span', { text: withTime })
  );
}

export function toggleTask(ctx, task) {
  const done = !task.done;
  ctx.store.put('tasks', {
    ...task,
    done,
    completedAt: done ? isoNow() : '',
    subtasks: done ? task.subtasks.map((sub) => ({ ...sub, done: true })) : task.subtasks
  });
  ctx.afterChange('tasks');
  if (done) ctx.platform.vibrate && ctx.platform.vibrate(15);
}

export function taskRow(ctx, task, { showDate = true, onEdit, trailing = [], showCheckbox = true } = {}) {
  const checkbox = h(
    'button.checkbox',
    {
      type: 'button',
      role: 'checkbox',
      'aria-checked': task.done ? 'true' : 'false',
      'aria-label': task.done ? t('tasks.markOpen') : t('tasks.markDone'),
      on: {
        click: (event) => {
          event.stopPropagation();
          toggleTask(ctx, task);
        }
      }
    },
    iconNode('check')
  );

  const subDone = task.subtasks.filter((sub) => sub.done).length;
  const meta = h('div.entity-row__meta');
  if (showDate) {
    const due = dueLabel(task, ctx.getLang());
    if (due) meta.appendChild(due);
  }
  if (task.subtasks.length) {
    meta.appendChild(
      h('span', { title: t('tasks.subtaskProgress', { done: subDone, total: task.subtasks.length }) }, iconNode('listCheck'),
        h('span', { text: `${subDone}/${task.subtasks.length}` }))
    );
  }
  const priority = priorityFlag(task.priority);
  if (priority) meta.appendChild(priority);
  const category = categoryDot(ctx, task.categoryId);
  if (category) meta.appendChild(category);

  const row = h(
    'div.entity-row' + (task.done ? '.entity-row--done' : ''),
    {
      role: 'button',
      tabindex: '0',
      on: {
        click: () => (onEdit ? onEdit(task) : null),
        keydown: (event) => {
          if ((event.key === 'Enter' || event.key === ' ') && onEdit) {
            event.preventDefault();
            onEdit(task);
          }
        }
      }
    },
    showCheckbox ? checkbox : null,
    h('div.entity-row__main', null, h('div.entity-row__title', { text: task.title }), meta.childNodes.length ? meta : null),
    h('div.entity-row__actions', null, ...trailing, iconNode('chevronRight'))
  );
  return row;
}

export function sortTasks(tasks, sort = 'due') {
  const list = tasks.slice();
  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (sort === 'priority') {
      const diff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (diff) return diff;
    }
    if (sort === 'created') return (b.createdAt || '').localeCompare(a.createdAt || '');
    const aDue = a.due || '9999-12-31';
    const bDue = b.due || '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return (a.priority ? PRIORITY_ORDER[a.priority] : 3) - (b.priority ? PRIORITY_ORDER[b.priority] : 3);
  });
  return list;
}

export function eventRow(ctx, event, dateKey, onEdit, trailing = []) {
  const category = ctx.categoryById(event.categoryId);
  return h(
    'button.entity-row',
    {
      type: 'button',
      on: {
        click: () => (onEdit ? onEdit(event) : null)
      }
    },
    h(
      'div.entity-row__main',
      null,
      h('div.entity-row__title', { text: event.title }),
      h(
        'div.entity-row__meta',
        null,
        h(
          'span',
          { style: { '--dot-color': category ? `var(--label-${category.color})` : 'var(--md-primary)' } },
          event.allDay ? t('calendar.allDay') : `${event.startTime || ''}${event.endTime ? `–${event.endTime}` : ''}`
        ),
        event.recurrence && event.recurrence.freq !== 'none'
          ? h('span', { title: t('calendar.repeats') }, iconNode('repeat'))
          : null,
        category ? categoryDot(ctx, category.id) : null
      )
    ),
    h('div.entity-row__actions', null, ...trailing),
    event.notes ? iconNode('note') : null
  );
}

export function reminderRow(ctx, reminder, onEdit) {
  const next = ctx.reminders.nextFor(reminder);
  const isPast = !reminder.enabled || (!next && reminder.at);
  const when = next
    ? `${formatDate(next, ctx.getLang(), { day: 'numeric', month: 'short' })}, ${formatTime(next, ctx.getLang())}`
    : reminder.at
      ? `${formatDate(reminder.at, ctx.getLang(), { day: 'numeric', month: 'short' })}, ${formatTime(reminder.at, ctx.getLang())}`
      : '';

  const toggle = h(
    'button.switch',
    {
      type: 'button',
      role: 'switch',
      'aria-checked': reminder.enabled ? 'true' : 'false',
      'aria-label': t('common.enabled'),
      on: {
        click: (event) => {
          event.stopPropagation();
          ctx.store.put('reminders', { ...reminder, enabled: !reminder.enabled });
          ctx.afterChange('reminders');
          ctx.toast(!reminder.enabled ? t('reminders.scheduled') : t('reminders.cancelled'));
        }
      }
    },
    null
  );

  return h(
    'div.entity-row' + (reminder.enabled ? '' : '.entity-row--done'),
    {
      role: 'button',
      tabindex: '0',
      on: {
        click: () => (onEdit ? onEdit(reminder) : null),
        keydown: (event) => {
          if (event.key === 'Enter' && onEdit) onEdit(reminder);
        }
      }
    },
    h('span.list-item__leading', null, iconNode(reminder.enabled ? 'bell' : 'bellOff')),
    h(
      'div.entity-row__main',
      null,
      h('div.entity-row__title', { text: reminder.title }),
      h(
        'div.entity-row__meta',
        null,
        h('span' + (isPast ? '.muted' : ''), { text: when }),
        reminder.recurrence && reminder.recurrence.freq !== 'none'
          ? h('span', { title: t('common.repeat') }, iconNode('repeat'))
          : null,
        categoryDot(ctx, reminder.categoryId)
      )
    ),
    h('div.entity-row__actions', null, toggle)
  );
}

export function weekdayLabels(lang, weekStart = 1) {
  const base = parseLocal('2024-01-01'); // Monday
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(base.getTime());
    date.setDate(base.getDate() + ((i + weekStart - 1 + 7) % 7));
    days.push(formatWeekdayShort(date, lang).replace('.', ''));
  }
  return days;
}
