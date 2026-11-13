/** Statistics: metrics, 7-day chart, 30-day activity, categories, history. */

import { h } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { toDateKey, todayKey, formatDate, formatWeekdayShort, addDays, startOfDay } from '../core/dates.js';
import { emptyState, progressBar, sectionTitle } from '../ui/controls.js';
import { PRIORITY_ORDER } from '../data/defaults.js';

function dayKeyOfIso(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return toDateKey(date);
}

export default function statsView(ctx) {
  function metrics() {
    const tasks = ctx.store.all('tasks');
    const total = tasks.length;
    const done = tasks.filter((task) => task.done).length;
    const overdue = tasks.filter((task) => !task.done && task.due && task.due < todayKey()).length;
    const active = total - done;
    const completion = total ? Math.round((done / total) * 100) : 0;

    // Streak: consecutive days (ending today) with at least one completed task.
    const completedDays = new Set(tasks.filter((task) => task.done && task.completedAt).map((task) => dayKeyOfIso(task.completedAt)));
    let streak = 0;
    let cursor = startOfDay(new Date());
    while (completedDays.has(toDateKey(cursor)) && streak < 3650) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }

    return { total, done, overdue, active, completion, streak, tasks };
  }

  function metricCard(label, value, extra) {
    return h(
      'div.metric-card',
      null,
      h('div.metric-card__label', { text: label }),
      h('div.metric-card__value', { text: String(value) }),
      extra || null
    );
  }

  function weekChart(tasks) {
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = addDays(new Date(), -i);
      const key = toDateKey(date);
      const completed = tasks.filter((task) => task.done && dayKeyOfIso(task.completedAt) === key).length;
      const created = tasks.filter((task) => dayKeyOfIso(task.createdAt) === key).length;
      days.push({ date, key, completed, created });
    }
    const max = Math.max(1, ...days.map((day) => Math.max(day.completed, day.created)));

    const chart = h('div.bar-chart');
    days.forEach((day) => {
      const col = h('div.bar-chart__col', { title: `${formatDate(day.date, ctx.getLang(), { day: 'numeric', month: 'short' })}: ${day.completed}` });
      col.appendChild(
        h('div.bar-chart__bar' + (day.completed ? '' : '.bar-chart__bar--empty'), {
          style: { height: `${Math.max(4, (day.completed / max) * 100)}%` }
        })
      );
      col.appendChild(h('div.bar-chart__label', { text: formatWeekdayShort(day.date, ctx.getLang()).replace('.', '').slice(0, 2) }));
      chart.appendChild(col);
    });

    return h(
      'section.chart-card',
      null,
      h('div.card__header', null, h('div.card__title', { text: t('stats.week') })),
      chart,
      h(
        'div.chart-legend',
        null,
        h('span.legend-key', { style: { '--key-color': 'var(--md-primary)' } }, h('span', { text: t('stats.completed') }))
      )
    );
  }

  function heatMap(tasks) {
    const cells = h('div.activity-heat');
    const counts = new Map();
    tasks.forEach((task) => {
      if (!task.done || !task.completedAt) return;
      const key = dayKeyOfIso(task.completedAt);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const max = Math.max(1, ...counts.values());
    for (let i = 29; i >= 0; i -= 1) {
      const date = addDays(new Date(), -i);
      const key = toDateKey(date);
      const count = counts.get(key) || 0;
      const intensity = count ? 0.25 + (count / max) * 0.75 : 0;
      cells.appendChild(
        h('div.activity-heat__cell', {
          title: `${formatDate(date, ctx.getLang(), { day: 'numeric', month: 'short' })}: ${count}`,
          style: count
            ? { background: `var(--md-primary)`, opacity: String(Math.min(1, intensity + 0.2)) }
            : undefined
        })
      );
    }
    return h(
      'section.chart-card',
      null,
      h('div.card__header', null, h('div.card__title', { text: t('stats.month') })),
      cells
    );
  }

  function byCategory(tasks) {
    const categories = ctx.store.all('categories').filter((category) => category.scope === 'task');
    const rows = categories
      .map((category) => ({
        category,
        total: tasks.filter((task) => task.categoryId === category.id).length
      }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
    const uncategorised = tasks.filter((task) => !task.categoryId || !ctx.categoryById(task.categoryId)).length;
    if (uncategorised) rows.push({ category: { name: t('common.none'), color: 'grey' }, total: uncategorised });

    if (!rows.length) return emptyState({ icon: 'chart', title: t('stats.noData') });
    const max = Math.max(...rows.map((row) => row.total));
    const wrapper = h('section.chart-card');
    wrapper.appendChild(h('div.card__header', null, h('div.card__title', { text: t('stats.byCategory') })));
    rows.forEach((row) => {
      wrapper.appendChild(
        h(
          'div.stack',
          { style: { gap: '4px', marginBottom: '10px' } },
          h(
            'div.row.row--between',
            null,
            h('span.small', { text: row.category.name }),
            h('span.small.muted', { text: String(row.total) })
          ),
          h('div.linear-progress.linear-progress--sm', null,
            h('div.linear-progress__value', {
              style: { width: `${(row.total / max) * 100}%`, background: `var(--label-${row.category.color})` }
            })
          )
        )
      );
    });
    return wrapper;
  }

  function byPriority(tasks) {
    const order = ['high', 'medium', 'low', 'none'];
    const wrapper = h('section.chart-card');
    wrapper.appendChild(h('div.card__header', null, h('div.card__title', { text: t('stats.byPriority') })));
    const total = Math.max(1, tasks.length);
    order.forEach((priority) => {
      const count = tasks.filter((task) => (task.priority || 'none') === priority).length;
      wrapper.appendChild(
        h(
          'div.stack',
          { style: { gap: '4px', marginBottom: '10px' } },
          h('div.row.row--between', null, h('span.small', { text: t(`priority.${priority}`) }), h('span.small.muted', { text: String(count) })),
          h('div.linear-progress.linear-progress--sm', null,
            h('div.linear-progress__value', { style: { width: `${(count / total) * 100}%` } }))
        )
      );
    });
    return wrapper;
  }

  function history(tasks) {
    const items = tasks
      .filter((task) => task.done && task.completedAt)
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
      .slice(0, 10);
    const wrapper = h('section');
    wrapper.appendChild(sectionTitle(t('stats.history')));
    if (!items.length) {
      wrapper.appendChild(h('div.card.card--flat', null, h('p.card__body', { text: t('stats.historyEmpty') })));
      return wrapper;
    }
    const list = h('div.list');
    items.forEach((task) => {
      list.appendChild(
        h(
          'div.list-item',
          null,
          h('span.list-item__leading', null, iconNode('check')),
          h(
            'div.list-item__content',
            null,
            h('div.list-item__headline', { text: task.title }),
            h('div.list-item__supporting', { text: formatDate(task.completedAt, ctx.getLang(), { day: 'numeric', month: 'short', year: 'numeric' }) })
          )
        )
      );
    });
    wrapper.appendChild(list);
    return wrapper;
  }

  function render() {
    const data = metrics();
    const root = h('div.stack');

    const grid = h(
      'div.stats-grid',
      null,
      metricCard(t('stats.total'), data.total),
      metricCard(t('stats.done'), data.done),
      metricCard(t('stats.overdue'), data.overdue),
      metricCard(t('stats.active'), data.active),
      metricCard(t('stats.completion'), `${data.completion}%`, progressBar(data.completion, { small: true, success: data.completion === 100 })),
      metricCard(t('stats.streak'), data.streak)
    );
    root.appendChild(grid);

    root.appendChild(weekChart(data.tasks));
    root.appendChild(heatMap(data.tasks));

    const otherCounts = h(
      'div.stats-grid',
      null,
      metricCard(t('stats.notes'), ctx.store.count('notes')),
      metricCard(t('stats.events'), ctx.store.count('events')),
      metricCard(t('stats.reminders'), ctx.store.count('reminders')),
      metricCard(t('stats.shopping'), ctx.store.count('listItems'))
    );
    root.appendChild(sectionTitle(t('home.overview')));
    root.appendChild(otherCounts);

    root.appendChild(byCategory(data.tasks));
    root.appendChild(byPriority(data.tasks));
    root.appendChild(history(data.tasks));
    return root;
  }

  return {
    render,
    appBarActions() {
      return [h('span.bridge-status', null, h('span.bridge-status__dot.bridge-status__dot--ok'), h('span', { text: `${data_label(metrics())}` }))];
    }
  };

  function data_label(data) {
    return `${data.done}/${data.total}`;
  }
}
