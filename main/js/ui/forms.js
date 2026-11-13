/**
 * Entity dialogs (task, event, reminder, note, shopping list, item, category).
 * Every dialog validates input, writes through the store and then notifies the
 * app shell so views, statistics and native reminders stay in sync.
 */

import { h } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { showDialog, confirmDialog } from './overlay.js';
import {
  textField,
  textAreaField,
  dateField,
  timeField,
  selectField,
  switchRow,
  chipRow,
  colorPicker,
  recurrenceFields,
  categoryChips,
  primaryButton,
  iconButton
} from './controls.js';
import { toDateKey, toTimeInput, formatDate } from '../core/dates.js';
import { generateId, LIMITS } from '../core/validate.js';

function priorityOptions() {
  return [
    { value: 'none', label: t('priority.none') },
    { value: 'low', label: t('priority.low') },
    { value: 'medium', label: t('priority.medium') },
    { value: 'high', label: t('priority.high') }
  ];
}

/** Small editable list of subtasks. */
function subtaskEditor(initial) {
  const items = initial.map((item) => ({ ...item }));
  const list = h('div.subtask-list');
  const addField = textField({ label: '', placeholder: t('tasks.formSubtaskPlaceholder'), maxLength: 160 });

  function render() {
    list.replaceChildren();
    if (!items.length) {
      list.appendChild(h('p.small.muted', { text: t('common.none') }));
    }
    items.forEach((item, index) => {
      const checkbox = h(
        'button.checkbox',
        {
          type: 'button',
          role: 'checkbox',
          'aria-checked': item.done ? 'true' : 'false',
          'aria-label': t('tasks.markDone'),
          on: {
            click: () => {
              item.done = !item.done;
              checkbox.setAttribute('aria-checked', item.done ? 'true' : 'false');
              row.classList.toggle('subtask-row--done', item.done);
            }
          }
        },
        iconNode('check')
      );
      const row = h(
        'div.subtask-row' + (item.done ? '.subtask-row--done' : ''),
        null,
        checkbox,
        h('span.subtask-row__title', { text: item.title }),
        iconButton('close', t('common.delete'), () => {
          items.splice(index, 1);
          render();
        }, { small: true })
      );
      list.appendChild(row);
    });
  }

  function add() {
    const title = addField.getValue();
    if (!title) return;
    if (items.length >= LIMITS.subtasks) return;
    items.push({ id: generateId(), title, done: false });
    addField.setValue('');
    render();
    addField.focus();
  }

  const addRow = h(
    'div.inline-form',
    null,
    h('div.grow', null, addField.el),
    primaryButton(t('common.add'), add, { variant: 'tonal', icon: 'plus' })
  );

  addField.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
    }
  });

  render();
  return {
    el: h('div', null, h('span.field__label', { text: t('tasks.formSubtasks') }), list, addRow),
    getValue: () => items.slice()
  };
}

function dialogContent(children) {
  return h('div.stack', null, children);
}

function saveButton(handler) {
  return { label: t('common.save'), variant: 'filled', onClick: handler };
}

/** Create/edit a task. */
export function openTaskDialog(ctx, { task = null, defaults = {} } = {}) {
  const isEdit = !!task;
  const draft = task || {
    title: '',
    notes: '',
    priority: 'none',
    due: defaults.due || '',
    dueTime: '',
    categoryId: defaults.categoryId || '',
    subtasks: []
  };

  const title = textField({
    label: t('tasks.formTitle'),
    value: draft.title,
    placeholder: t('tasks.formTitlePlaceholder'),
    required: true,
    autofocus: !isEdit
  });
  const notes = textAreaField({ label: t('tasks.formNotes'), value: draft.notes });
  const priority = chipRow({ options: priorityOptions(), value: draft.priority || 'none' });
  const dueDate = dateField({ label: t('tasks.formDueDate'), value: draft.due || '' });
  const dueTime = timeField({ label: t('tasks.formDueTime'), value: draft.dueTime || '' });
  const categories = chipRow({
    options: [{ value: '', label: t('common.none') }].concat(
      ctx.categoriesFor('task').map((category) => ({ value: category.id, label: category.name, color: category.color }))
    ),
    value: draft.categoryId || ''
  });
  const subtasks = subtaskEditor(draft.subtasks || []);

  const content = dialogContent([
    title.el,
    notes.el,
    priority.el,
    h('div.row', { style: { gap: '12px', alignItems: 'flex-start' } }, h('div.grow', null, dueDate.el), h('div.grow', null, dueTime.el)),
    categories.el,
    subtasks.el
  ]);

  const dialog = showDialog({
    title: isEdit ? t('tasks.edit') : t('tasks.new'),
    content,
    actions: [
      { label: t('common.cancel'), variant: 'text' },
      saveButton(() => {
        const titleValue = title.getValue();
        if (!titleValue) {
          title.setError(t('tasks.titleRequired'));
          title.focus();
          return false;
        }
        const payload = {
          ...(task || {}),
          id: task ? task.id : generateId(),
          title: titleValue,
          notes: notes.getValue(),
          priority: priority.getValue()[0] || 'none',
          due: dueDate.getValue(),
          dueTime: dueTime.getValue(),
          categoryId: categories.getValue()[0] || '',
          subtasks: subtasks.getValue(),
          createdAt: task ? task.createdAt : undefined,
          done: task ? task.done : false
        };
        ctx.store.put('tasks', payload);
        ctx.afterChange('tasks');
        ctx.toast(t('toast.saved'));
        return true;
      })
    ]
  });
  return dialog;
}

/** Create/edit a calendar event. */
export function openEventDialog(ctx, { event = null, date = null } = {}) {
  const isEdit = !!event;
  const draft = event || {
    title: '',
    notes: '',
    start: date || toDateKey(new Date()),
    startTime: '09:00',
    endTime: '10:00',
    allDay: false,
    categoryId: '',
    recurrence: { freq: 'none', interval: 1, until: '' }
  };

  const title = textField({
    label: t('calendar.eventTitle'),
    value: draft.title,
    placeholder: t('calendar.eventTitlePlaceholder'),
    required: true,
    autofocus: !isEdit
  });
  const allDay = switchRow({
    title: t('calendar.allDay'),
    checked: !!draft.allDay,
    onChange: (checked) => {
      times.hidden = checked;
    }
  });
  const startDate = dateField({ label: t('common.date'), value: draft.start, required: true });
  const startTime = timeField({ label: t('calendar.startTime'), value: draft.startTime || '09:00', required: true });
  const endTime = timeField({ label: t('calendar.endTime'), value: draft.endTime || '10:00' });
  const times = h('div.row', { style: { gap: '12px', alignItems: 'flex-start' }, hidden: !!draft.allDay },
    h('div.grow', null, startTime.el), h('div.grow', null, endTime.el));
  const notes = textAreaField({ label: t('common.notes'), value: draft.notes });
  const categories = chipRow({
    options: [{ value: '', label: t('common.none') }].concat(
      ctx.categoriesFor('event').map((category) => ({ value: category.id, label: category.name, color: category.color }))
    ),
    value: draft.categoryId || ''
  });
  const recurrence = recurrenceFields(draft.recurrence);

  const dialog = showDialog({
    title: isEdit ? t('calendar.editEvent') : t('calendar.newEvent'),
    content: dialogContent([title.el, startDate.el, allDay.el, times, categories.el, recurrence.el, notes.el]),
    actions: [
      { label: t('common.cancel'), variant: 'text' },
      saveButton(() => {
        const titleValue = title.getValue();
        if (!titleValue) {
          title.setError(t('calendar.formTitleRequired'));
          title.focus();
          return false;
        }
        const dateValue = startDate.getValue();
        if (!dateValue) {
          startDate.setError(t('errors.dateInvalid'));
          return false;
        }
        const isAllDay = allDay.getValue();
        if (!isAllDay && endTime.getValue() && startTime.getValue() > endTime.getValue()) {
          endTime.setError(t('calendar.endBeforeStart'));
          return false;
        }
        ctx.store.put('events', {
          ...(event || {}),
          id: event ? event.id : generateId(),
          title: titleValue,
          notes: notes.getValue(),
          start: dateValue,
          startTime: isAllDay ? '' : startTime.getValue(),
          endTime: isAllDay ? '' : endTime.getValue(),
          allDay: isAllDay,
          categoryId: categories.getValue()[0] || '',
          recurrence: recurrence.getValue(),
          createdAt: event ? event.createdAt : undefined
        });
        ctx.afterChange('events');
        ctx.toast(t('toast.saved'));
        return true;
      })
    ]
  });
  return dialog;
}

/** Create/edit a reminder (the Kotlin side mirrors these into alarms). */
export function openReminderDialog(ctx, { reminder = null, at = null } = {}) {
  const isEdit = !!reminder;
  const baseDate = at ? new Date(at) : new Date(Date.now() + 10 * 60 * 1000);
  const draft = reminder || {
    title: '',
    notes: '',
    at: `${toDateKey(baseDate)}T${toTimeInput(baseDate)}`,
    recurrence: { freq: 'none', interval: 1, until: '' },
    categoryId: '',
    enabled: true
  };
  const atParts = String(draft.at || '').split('T');

  const title = textField({
    label: t('reminders.formTitle'),
    value: draft.title,
    required: true,
    autofocus: !isEdit
  });
  const date = dateField({ label: t('reminders.formWhen'), value: atParts[0] || toDateKey(baseDate), required: true });
  const time = timeField({ label: t('common.time'), value: atParts[1] || toTimeInput(baseDate), required: true });
  const categories = chipRow({
    options: [{ value: '', label: t('common.none') }].concat(
      ctx.categoriesFor('reminder').map((category) => ({ value: category.id, label: category.name, color: category.color }))
    ),
    value: draft.categoryId || ''
  });
  const recurrence = recurrenceFields(draft.recurrence);
  const enabled = switchRow({ title: t('common.enabled'), checked: draft.enabled !== false });
  const notes = textAreaField({ label: t('common.notes'), value: draft.notes });

  const dialog = showDialog({
    title: isEdit ? t('reminders.edit') : t('reminders.new'),
    content: dialogContent([title.el, date.el, time.el, recurrence.el, categories.el, enabled.el, notes.el]),
    actions: [
      { label: t('common.cancel'), variant: 'text' },
      saveButton(() => {
        const titleValue = title.getValue();
        if (!titleValue) {
          title.setError(t('reminders.formTitleRequired'));
          title.focus();
          return false;
        }
        if (!date.getValue() || !time.getValue()) {
          title.setError(t('reminders.formTimeRequired'));
          return false;
        }
        ctx.store.put('reminders', {
          ...(reminder || {}),
          id: reminder ? reminder.id : generateId(),
          title: titleValue,
          notes: notes.getValue(),
          at: `${date.getValue()}T${time.getValue()}`,
          recurrence: recurrence.getValue(),
          categoryId: categories.getValue()[0] || '',
          enabled: enabled.getValue(),
          createdAt: reminder ? reminder.createdAt : undefined,
          lastFiredAt: reminder ? reminder.lastFiredAt : ''
        });
        ctx.afterChange('reminders');
        ctx.toast(t('reminders.scheduled'));
        return true;
      })
    ]
  });
  return dialog;
}

/** Create/edit a note. */
export function openNoteDialog(ctx, { note = null, defaults = {} } = {}) {
  const isEdit = !!note;
  const draft = note || { title: '', body: '', color: 'amber', pinned: false, categoryId: '' };

  const title = textField({ label: t('notes.formTitle'), value: draft.title, autofocus: !isEdit });
  const body = textAreaField({ label: t('notes.formBody'), value: draft.body, rows: 6 });
  const color = colorPicker({ value: draft.color || 'amber' });
  const pinned = switchRow({ title: t('notes.formPin'), checked: !!draft.pinned });
  const categories = chipRow({
    options: [{ value: '', label: t('common.none') }].concat(
      ctx.categoriesFor('note').map((category) => ({ value: category.id, label: category.name, color: category.color }))
    ),
    value: draft.categoryId || ''
  });

  const dialog = showDialog({
    title: isEdit ? t('notes.edit') : t('notes.new'),
    content: dialogContent([title.el, body.el, h('span.field__label', { text: t('common.color') }), color.el, categories.el, pinned.el]),
    actions: [
      { label: t('common.cancel'), variant: 'text' },
      saveButton(() => {
        const titleValue = title.getValue();
        const bodyValue = body.getValue();
        if (!titleValue && !bodyValue) {
          title.setError(t('notes.formTitleRequired'));
          return false;
        }
        ctx.store.put('notes', {
          ...(note || {}),
          id: note ? note.id : generateId(),
          title: titleValue || bodyValue.slice(0, 60),
          body: bodyValue,
          color: color.getValue(),
          pinned: pinned.getValue(),
          categoryId: categories.getValue()[0] || '',
          createdAt: note ? note.createdAt : undefined
        });
        ctx.afterChange('notes');
        ctx.toast(t('toast.saved'));
        return true;
      })
    ]
  });
  return dialog;
}

/** Create/edit a shopping list. */
export function openListDialog(ctx, { list = null } = {}) {
  const isEdit = !!list;
  const title = textField({
    label: t('shopping.formListTitle'),
    value: list ? list.title : '',
    required: true,
    autofocus: true
  });
  const categories = chipRow({
    options: [{ value: '', label: t('common.none') }].concat(
      ctx.categoriesFor('shopping').map((category) => ({ value: category.id, label: category.name, color: category.color }))
    ),
    value: list ? list.categoryId || '' : ''
  });
  const dialog = showDialog({
    title: isEdit ? t('common.edit') : t('shopping.newList'),
    content: dialogContent([title.el, categories.el]),
    actions: [
      { label: t('common.cancel'), variant: 'text' },
      saveButton(() => {
        const value = title.getValue();
        if (!value) {
          title.setError(t('shopping.listTitleRequired'));
          return false;
        }
        ctx.store.put('lists', {
          ...(list || {}),
          id: list ? list.id : generateId(),
          title: value,
          categoryId: categories.getValue()[0] || ''
        });
        ctx.afterChange('lists');
        ctx.toast(t('toast.saved'));
        return true;
      })
    ]
  });
  return dialog;
}

/** Add/edit a shopping item. */
export function openItemDialog(ctx, { item = null, listId }) {
  const isEdit = !!item;
  const title = textField({
    label: t('common.title'),
    value: item ? item.title : '',
    placeholder: t('shopping.itemPlaceholder'),
    required: true,
    autofocus: true
  });
  const qty = textField({ label: t('shopping.qty'), value: String(item ? item.qty : 1), type: 'number', min: '1', max: '999' });
  const unit = textField({ label: t('shopping.unit'), value: item ? item.unit : '', maxLength: 16 });
  const dialog = showDialog({
    title: isEdit ? t('common.edit') : t('shopping.addItem'),
    content: dialogContent([title.el, h('div.row', { style: { gap: '12px', alignItems: 'flex-start' } }, h('div.grow', null, qty.el), h('div.grow', null, unit.el))]),
    actions: [
      { label: t('common.cancel'), variant: 'text' },
      saveButton(() => {
        const value = title.getValue();
        if (!value) {
          title.setError(t('shopping.itemTitleRequired'));
          return false;
        }
        ctx.store.put('listItems', {
          ...(item || {}),
          id: item ? item.id : generateId(),
          listId: item ? item.listId : listId,
          title: value,
          qty: Math.max(1, Math.min(999, Number(qty.getValue()) || 1)),
          unit: unit.getValue(),
          done: item ? item.done : false
        });
        ctx.afterChange('listItems');
        ctx.toast(t('toast.saved'));
        return true;
      })
    ]
  });
  return dialog;
}

/** Create/edit a category. */
export function openCategoryDialog(ctx, { category = null, scope = 'task' } = {}) {
  const isEdit = !!category;
  const name = textField({
    label: t('category.name'),
    value: category ? category.name : '',
    required: true,
    autofocus: true
  });
  const scopeSelect = selectField({
    label: t('common.category'),
    value: category ? category.scope : scope,
    options: [
      { value: 'task', label: t('category.scopeTask') },
      { value: 'event', label: t('category.scopeEvent') },
      { value: 'note', label: t('category.scopeNote') },
      { value: 'reminder', label: t('category.scopeReminder') },
      { value: 'shopping', label: t('category.scopeShopping') }
    ]
  });
  const color = colorPicker({ value: category ? category.color : 'purple' });
  const dialog = showDialog({
    title: isEdit ? t('common.edit') : t('category.new'),
    content: dialogContent([name.el, scopeSelect.el, h('span.field__label', { text: t('common.color') }), color.el]),
    actions: [
      { label: t('common.cancel'), variant: 'text' },
      saveButton(() => {
        const value = name.getValue();
        if (!value) {
          name.setError(t('category.nameRequired'));
          return false;
        }
        ctx.store.put('categories', {
          ...(category || {}),
          id: category ? category.id : generateId(),
          name: value,
          scope: scopeSelect.getValue(),
          color: color.getValue()
        });
        ctx.afterChange('categories');
        ctx.toast(t('toast.saved'));
        return true;
      })
    ]
  });
  return dialog;
}

/** Confirmation + delete for any entity, with undo. */
export async function deleteEntity(ctx, type, entity, { title, text } = {}) {
  const ok = await confirmDialog({
    title: title || t('common.delete'),
    text: text || '',
    confirmLabel: t('common.delete')
  });
  if (!ok) return false;
  const removed = ctx.store.remove(type, entity.id);
  if (type === 'lists') {
    ctx.store.removeMany(
      'listItems',
      ctx.store.find('listItems', (item) => item.listId === entity.id).map((item) => item.id)
    );
  }
  if (type === 'reminders' && ctx.platform.isNative) {
    ctx.platform.cancelReminder(entity.id);
  }
  ctx.afterChange(type);
  ctx.toast(t('toast.deleted'), {
    action: t('common.undo'),
    onAction: () => {
      if (removed) {
        ctx.store.put(type, removed);
        ctx.afterChange(type);
      }
    }
  });
  return true;
}

export function entityDialogIcon(name) {
  return h('span', null, iconNode(name));
}

export { formatDate };
