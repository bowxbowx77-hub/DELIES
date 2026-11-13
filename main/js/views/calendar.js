/** Calendar: month / week / day modes with events, recurrence and categories. */

import { h, clear } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';
import {
  toDateKey,
  todayKey,
  monthMatrix,
  weekDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  formatMonthYear,
  formatDate,
  formatWeekdayShort,
  addDays,
  addMonths,
  expandOccurrences,
  isSameDay,
  parseLocal,
  startOfDay,
  endOfDay
} from '../core/dates.js';
import { eventRow, taskRow } from './shared.js';
import { openEventDialog, openTaskDialog, deleteEntity } from '../ui/forms.js';
import { emptyState, iconButton, segmentedControl, primaryButton } from '../ui/controls.js';

function endOfMonthSafe(date) {
  const copy = startOfMonth(date);
  copy.setMonth(copy.getMonth() + 1);
  copy.setDate(0);
  return endOfDay(copy);
}

export default function calendarView(ctx) {
  const state =
    ctx.viewState.calendar ||
    (ctx.viewState.calendar = { mode: 'month', selected: todayKey() });

  function selectedDate() {
    return parseLocal(state.selected) || new Date();
  }

  function eventsOn(date) {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    const found = [];
    ctx.store.all('events').forEach((event) => {
      const startValue = `${event.start}T${event.allDay ? '00:00' : event.startTime || '00:00'}`;
      expandOccurrences(startValue, event.recurrence, addDays(dayStart, -1), dayEnd).forEach((occ) => {
        if (isSameDay(occ.date, date)) found.push({ event, date: occ.date });
      });
    });
    return found.sort((a, b) => {
      if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1;
      return (a.event.startTime || '').localeCompare(b.event.startTime || '');
    });
  }

  function tasksOn(date) {
    const key = toDateKey(date);
    return ctx.store
      .find('tasks', (task) => task.due === key)
      .sort((a, b) => Number(a.done) - Number(b.done) || (a.dueTime || '').localeCompare(b.dueTime || ''));
  }

  function eventDots(date) {
    const events = eventsOn(date);
    const dots = h('div.cal-cell__dots');
    events.slice(0, 3).forEach(({ event }) => {
      const category = ctx.categoryById(event.categoryId);
      dots.appendChild(
        h('span.cal-dot', { style: { background: category ? `var(--label-${category.color})` : 'var(--md-primary)' } })
      );
    });
    if (events.length > 3) dots.appendChild(h('span.small.muted', { text: `+${events.length - 3}` }));
    return dots;
  }

  function selectDate(date) {
    state.selected = toDateKey(date);
    ctx.refresh();
  }

  function monthView(host) {
    const weekStart = ctx.settings.weekStart || 1;
    const header = h('div.cal-weekdays');
    weekDays(new Date(), weekStart).forEach((day) => {
      header.appendChild(h('span', { text: formatWeekdayShort(day, ctx.getLang()).replace('.', '') }));
    });
    const grid = h('div.cal-month');
    const base = selectedDate();
    monthMatrix(base, weekStart).forEach((date) => {
      const outside = date.getMonth() !== base.getMonth();
      const classes = [
        'cal-cell',
        outside ? 'cal-cell--outside' : '',
        isSameDay(date, new Date()) ? 'cal-cell--today' : '',
        toDateKey(date) === state.selected ? 'cal-cell--selected' : ''
      ]
        .filter(Boolean)
        .join('.');
      grid.appendChild(
        h(
          `button.${classes}`,
          {
            type: 'button',
            on: { click: () => selectDate(date) },
            'aria-label': formatDate(date, ctx.getLang(), { day: 'numeric', month: 'long' })
          },
          h('span.cal-cell__num', { text: String(date.getDate()) }),
          eventDots(date)
        )
      );
    });
    host.appendChild(header);
    host.appendChild(grid);
    host.appendChild(agenda(selectedDate(), { showDateTitle: true }));
  }

  function weekView(host) {
    const weekStart = ctx.settings.weekStart || 1;
    const days = weekDays(selectedDate(), weekStart);
    const strip = h('div.week-strip');
    days.forEach((day) => {
      strip.appendChild(
        h(
          'button.week-strip__day',
          {
            type: 'button',
            'aria-pressed': toDateKey(day) === state.selected ? 'true' : 'false',
            on: { click: () => selectDate(day) }
          },
          h('span.week-strip__dow', { text: formatWeekdayShort(day, ctx.getLang()).replace('.', '') }),
          h('span.week-strip__num', { text: String(day.getDate()) }),
          eventsOn(day).length ? h('span.cal-dot') : null
        )
      );
    });
    host.appendChild(strip);

    days.forEach((day) => {
      const events = eventsOn(day);
      const tasks = tasksOn(day);
      if (!events.length && !tasks.length) return;
      host.appendChild(
        h(
          'h3.section-title',
          null,
          h('span', { text: formatDate(day, ctx.getLang(), { weekday: 'short', day: 'numeric', month: 'short' }) }),
          toDateKey(day) === todayKey() ? h('span.badge', { text: t('common.today') }) : null
        )
      );
      const list = h('div.list');
      events.forEach(({ event }) =>
        list.appendChild(
          eventRow(ctx, event, day, (item) => openEventDialog(ctx, { event: item }), [
            iconButton('trash', t('common.delete'), (clickEvent) => {
              clickEvent.stopPropagation();
              deleteEntity(ctx, 'events', event, { title: t('common.delete'), text: event.title });
            }, { small: true })
          ])
        )
      );
      tasks.forEach((task) =>
        list.appendChild(taskRow(ctx, task, { showDate: false, onEdit: (item) => openTaskDialog(ctx, { task: item }) }))
      );
      host.appendChild(list);
    });

    if (!host.querySelector('.list')) {
      host.appendChild(emptyState({ icon: 'calendar', title: t('calendar.emptyDay') }));
    }
  }

  function dayView(host) {
    host.appendChild(agenda(selectedDate(), { showDateTitle: true, timeline: true }));
  }

  function agenda(date, { showDateTitle = false, timeline = false } = {}) {
    const events = eventsOn(date);
    const tasks = tasksOn(date);
    const wrapper = h('div.cal-day-agenda');

    if (showDateTitle) {
      wrapper.appendChild(
        h(
          'h3.section-title',
          null,
          h('span', { text: formatDate(date, ctx.getLang(), { weekday: 'long', day: 'numeric', month: 'long' }) }),
          events.length ? h('span.badge', { text: t('calendar.eventsCount', { n: events.length }) }) : null
        )
      );
    }

    if (!events.length && !tasks.length) {
      wrapper.appendChild(emptyState({ icon: 'calendar', title: t('calendar.emptyDay') }));
      return wrapper;
    }

    if (events.length) {
      const list = h('div.list');
      events.forEach(({ event }) =>
        list.appendChild(
          eventRow(ctx, event, date, (item) => openEventDialog(ctx, { event: item }), [
            iconButton('trash', t('common.delete'), (clickEvent) => {
              clickEvent.stopPropagation();
              deleteEntity(ctx, 'events', event, { title: t('common.delete'), text: event.title });
            }, { small: true })
          ])
        )
      );
      wrapper.appendChild(list);
    }

    if (tasks.length) {
      wrapper.appendChild(h('h3.section-title', null, h('span', { text: t('nav.tasks') })));
      const list = h('div.list');
      tasks.forEach((task) =>
        list.appendChild(taskRow(ctx, task, { showDate: false, onEdit: (item) => openTaskDialog(ctx, { task: item }) }))
      );
      wrapper.appendChild(list);
    }
    return wrapper;
  }

  function render() {
    const root = h('div.stack');
    const mode = segmentedControl({
      options: [
        { value: 'month', label: t('calendar.month') },
        { value: 'week', label: t('calendar.week') },
        { value: 'day', label: t('calendar.day') }
      ],
      value: state.mode,
      onChange: (value) => {
        state.mode = value;
        ctx.refresh();
      }
    });

    const label =
      state.mode === 'month'
        ? formatMonthYear(selectedDate(), ctx.getLang())
        : state.mode === 'week'
          ? `${formatDate(startOfWeek(selectedDate(), ctx.settings.weekStart || 1), ctx.getLang(), { day: 'numeric', month: 'short' })} – ${formatDate(endOfWeek(selectedDate(), ctx.settings.weekStart || 1), ctx.getLang(), { day: 'numeric', month: 'short' })}`
          : formatDate(selectedDate(), ctx.getLang(), { weekday: 'short', day: 'numeric', month: 'long' });

    function shift(direction) {
      const current = selectedDate();
      if (state.mode === 'month') state.selected = toDateKey(addMonths(current, direction, true));
      else if (state.mode === 'week') state.selected = toDateKey(addDays(current, 7 * direction));
      else state.selected = toDateKey(addDays(current, direction));
      ctx.refresh();
    }

    const toolbar = h(
      'div.cal-toolbar',
      null,
      iconButton('chevronLeft', t('calendar.prev'), () => shift(-1), { small: true }),
      h('div.cal-toolbar__label', { text: label }),
      iconButton('chevronRight', t('calendar.next'), () => shift(1), { small: true }),
      h(
        'button.btn.btn--text.btn--small',
        { type: 'button', on: { click: () => {
          state.selected = todayKey();
          ctx.refresh();
        } } },
        t('common.today')
      )
    );

    root.appendChild(mode.el);
    root.appendChild(toolbar);

    const host = h('div');
    if (state.mode === 'month') monthView(host);
    else if (state.mode === 'week') weekView(host);
    else dayView(host);
    root.appendChild(host);

    root.appendChild(
      primaryButton(t('calendar.newEvent'), () => openEventDialog(ctx, { date: state.selected }), {
        variant: 'tonal',
        icon: 'plus',
        block: true
      })
    );

    return root;
  }

  return {
    render,
    fab() {
      return { icon: 'plus', label: t('calendar.newEvent'), onClick: () => openEventDialog(ctx, { date: state.selected }) };
    },
    appBarActions() {
      return [
        iconButton('calendar', t('common.today'), () => {
          state.selected = todayKey();
          ctx.refresh();
        }, { small: true }),
        iconButton('plus', t('calendar.newEvent'), () => openEventDialog(ctx, { date: state.selected }), { small: true })
      ];
    }
  };
}
