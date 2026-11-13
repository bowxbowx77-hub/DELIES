/** Tasks: search, filters, sorting, grouped list, create/edit/delete. */

import { h, clear } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { todayKey } from '../core/dates.js';
import { taskRow, sortTasks } from './shared.js';
import { openTaskDialog, deleteEntity } from '../ui/forms.js';
import { emptyState, iconButton, chipRow, selectField } from '../ui/controls.js';

export default function tasksView(ctx) {
  const state = ctx.viewState.tasks || (ctx.viewState.tasks = { filter: 'all', query: '', sort: 'due' });
  let listHost = null;
  let countLabel = null;

  function matchesFilter(task, filter) {
    const today = todayKey();
    const overdue = !task.done && task.due && task.due < today;
    switch (filter) {
      case 'open':
        return !task.done;
      case 'done':
        return task.done;
      case 'overdue':
        return !!overdue;
      case 'today':
        return task.due === today;
      default:
        return true;
    }
  }

  function matchesQuery(task, query) {
    if (!query) return true;
    const needle = query.toLowerCase();
    if (task.title.toLowerCase().includes(needle)) return true;
    if (task.notes && task.notes.toLowerCase().includes(needle)) return true;
    return task.subtasks.some((sub) => sub.title.toLowerCase().includes(needle));
  }

  function groupOf(task) {
    const today = todayKey();
    if (task.done) return 'done';
    if (!task.due) return 'noDate';
    if (task.due < today) return 'overdue';
    if (task.due === today) return 'today';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(
      tomorrow.getDate()
    ).padStart(2, '0')}`;
    if (task.due === tomorrowKey) return 'tomorrow';
    return 'later';
  }

  const GROUP_ORDER = ['overdue', 'today', 'tomorrow', 'later', 'noDate', 'done'];
  const GROUP_KEYS = {
    overdue: 'tasks.groupOverdue',
    today: 'tasks.groupToday',
    tomorrow: 'tasks.groupTomorrow',
    later: 'tasks.groupLater',
    noDate: 'tasks.groupNoDate',
    done: 'tasks.groupDone'
  };

  function filteredTasks() {
    return sortTasks(
      ctx.store
        .all('tasks')
        .filter((task) => matchesFilter(task, state.filter) && matchesQuery(task, state.query)),
      state.sort
    );
  }

  function openEditor(task) {
    openTaskDialog(ctx, { task });
  }

  function renderList() {
    if (!listHost) return;
    clear(listHost);
    const tasks = filteredTasks();
    if (countLabel) countLabel.textContent = String(tasks.length);

    if (!tasks.length) {
      listHost.appendChild(
        state.query || state.filter !== 'all'
          ? emptyState({ icon: 'search', title: t('tasks.noResults'), text: t('tasks.noResultsText') })
          : emptyState({
              icon: 'tasks',
              title: t('tasks.emptyTitle'),
              text: t('tasks.emptyText'),
              action: h(
                'button.btn.btn--tonal',
                { type: 'button', style: { marginTop: '12px' }, on: { click: () => openTaskDialog(ctx, {}) } },
                t('tasks.new')
              )
            })
      );
      return;
    }

    GROUP_ORDER.forEach((group) => {
      const items = tasks.filter((task) => groupOf(task) === group);
      if (!items.length) return;
      listHost.appendChild(h('h3.section-title', null, h('span', { text: t(GROUP_KEYS[group]) }),
        h('span.badge', { text: String(items.length) })));
      const list = h('div.list');
      items.forEach((task) => {
        const trailing = [
          iconButton(
            'trash',
            t('common.delete'),
            (event) => {
              event.stopPropagation();
              deleteEntity(ctx, 'tasks', task, { title: t('common.delete'), text: task.title });
            },
            { small: true }
          )
        ];
        list.appendChild(taskRow(ctx, task, { onEdit: openEditor, trailing }));
      });
      listHost.appendChild(list);
    });
  }

  function render() {
    const root = h('div.stack');
    const search = h('input', {
      type: 'search',
      placeholder: t('tasks.searchPlaceholder'),
      'aria-label': t('tasks.searchPlaceholder'),
      value: state.query
    });
    const searchBox = h(
      'div.search-field',
      null,
      iconNode('search'),
      search,
      h(
        'button.icon-btn.icon-btn--sm',
        {
          type: 'button',
          'aria-label': t('common.clear'),
          on: {
            click: () => {
              state.query = '';
              search.value = '';
              renderList();
            }
          }
        },
        iconNode('close')
      )
    );

    let searchTimer = 0;
    search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = search.value.trim();
        renderList();
      }, 180);
    });

    const filters = chipRow({
      options: [
        { value: 'all', label: t('tasks.filterAll') },
        { value: 'open', label: t('tasks.filterOpen') },
        { value: 'today', label: t('tasks.filterToday') },
        { value: 'overdue', label: t('tasks.filterOverdue') },
        { value: 'done', label: t('tasks.filterDone') }
      ],
      value: state.filter,
      onChange: (value) => {
        state.filter = value;
        renderList();
      }
    });

    const sortSelect = selectField({
      label: '',
      value: state.sort,
      options: [
        { value: 'due', label: t('tasks.sortDue') },
        { value: 'priority', label: t('tasks.sortPriority') },
        { value: 'created', label: t('tasks.sortCreated') }
      ]
    });
    sortSelect.el.style.minWidth = '160px';
    sortSelect.el.style.marginBottom = '0';
    sortSelect.select.classList.add('small');
    sortSelect.select.addEventListener('change', () => {
      state.sort = sortSelect.getValue();
      renderList();
    });

    countLabel = h('span.badge');

    root.appendChild(searchBox);
    root.appendChild(filters.el);
    root.appendChild(h('div.row.row--between', { style: { marginTop: '4px' } },
      h('div.row', null, h('span.small.muted', { text: t('common.count') }), countLabel),
      sortSelect.el));
    listHost = h('div.stack');
    root.appendChild(listHost);
    renderList();
    return root;
  }

  return {
    render,
    update() {
      renderList();
      return true;
    },
    fab() {
      return { icon: 'plus', label: t('tasks.new'), onClick: () => openTaskDialog(ctx, { defaults: { due: todayKey() } }) };
    },
    appBarActions() {
      return [
        iconButton('settings', t('nav.settings'), () => ctx.navigate('settings'), { small: true }),
        iconButton('plus', t('tasks.new'), () => openTaskDialog(ctx, {}), { small: true })
      ];
    }
  };
}
