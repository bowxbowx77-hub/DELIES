/**
 * Reusable Material 3 form controls.
 * Every control returns { el, getValue, setValue, focus, setError, input }.
 */

import { h } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { COLOR_NAMES } from '../data/defaults.js';
import { LIMITS } from '../core/validate.js';
import { toDateKey, toTimeInput } from '../core/dates.js';

let uid = 0;
function nextId(prefix) {
  uid += 1;
  return `${prefix}-${uid}`;
}

export function iconButton(name, label, onClick, { variant = '', small = false } = {}) {
  return h(
    `button.icon-btn${variant ? `.icon-btn--${variant}` : ''}${small ? '.icon-btn--sm' : ''}`,
    {
      type: 'button',
      'aria-label': label,
      title: label,
      on: { click: onClick }
    },
    iconNode(name)
  );
}

export function textField({
  label,
  value = '',
  placeholder = '',
  type = 'text',
  required = false,
  hint = '',
  maxLength = LIMITS.title,
  autofocus = false,
  icon = '',
  min,
  max
}) {
  const id = nextId('field');
  const input = h('input', {
    id,
    type,
    value,
    placeholder,
    maxlength: String(maxLength),
    required: required || undefined,
    autocomplete: 'off',
    'aria-required': required ? 'true' : undefined
  });
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  const control = h('div.field__control');
  if (icon) control.appendChild(iconNode(icon));
  control.appendChild(input);

  const errorNode = h('p.field__error', { role: 'alert', hidden: true });
  const el = h(
    'label.field',
    { for: id },
    h('span.field__label', { text: label + (required ? ' *' : '') }),
    control,
    hint ? h('span.field__hint', { text: hint }) : null,
    errorNode
  );

  const api = {
    el,
    input,
    control,
    getValue: () => input.value.trim(),
    getRaw: () => input.value,
    setValue: (next) => {
      input.value = next;
    },
    focus: () => input.focus(),
    setError(message) {
      if (message) {
        errorNode.textContent = message;
        errorNode.hidden = false;
        control.classList.add('field__control--error');
      } else {
        errorNode.hidden = true;
        control.classList.remove('field__control--error');
      }
    }
  };
  if (autofocus) setTimeout(() => input.focus(), 60);
  return api;
}

export function textAreaField({ label, value = '', placeholder = '', maxLength = LIMITS.body, rows = 3 }) {
  const id = nextId('area');
  const input = h('textarea', { id, placeholder, maxlength: String(maxLength), rows: String(rows) });
  input.value = value;
  const control = h('div.field__control.field__control--textarea', null, input);
  const el = h('label.field', { for: id }, h('span.field__label', { text: label }), control);
  return {
    el,
    input,
    getValue: () => input.value.trim(),
    getRaw: () => input.value,
    setValue: (next) => {
      input.value = next;
    },
    focus: () => input.focus(),
    setError() {}
  };
}

export function dateField({ label, value = '', required = false, autofocus = false }) {
  const field = textField({ label, value, type: 'date', required, autofocus });
  return field;
}

export function timeField({ label, value = '', required = false }) {
  return textField({ label, value, type: 'time', required });
}

export function selectField({ label, options, value = '', hint = '' }) {
  const id = nextId('select');
  const select = h('select', { id });
  options.forEach((option) => {
    const node = h('option', { value: option.value, text: option.label });
    if (String(option.value) === String(value)) node.selected = true;
    select.appendChild(node);
  });
  const control = h('div.field__control.field__control--select', null, select);
  const el = h(
    'div.field',
    null,
    h('label.field__label', { for: id, text: label }),
    control,
    hint ? h('span.field__hint', { text: hint }) : null
  );
  return {
    el,
    select,
    getValue: () => select.value,
    setValue: (next) => {
      select.value = next;
    },
    setError() {}
  };
}

export function switchRow({ title, desc, checked = false, onChange }) {
  const button = h('button.switch', {
    type: 'button',
    role: 'switch',
    'aria-checked': checked ? 'true' : 'false',
    'aria-label': title,
    on: {
      click: () => {
        const next = button.getAttribute('aria-checked') !== 'true';
        button.setAttribute('aria-checked', next ? 'true' : 'false');
        if (typeof onChange === 'function') onChange(next);
      }
    }
  });
  const el = h(
    'div.settings-row',
    null,
    h(
      'div.settings-row__text',
      null,
      h('div.settings-row__title', { text: title }),
      desc ? h('div.settings-row__desc', { text: desc }) : null
    ),
    button
  );
  return {
    el,
    button,
    getValue: () => button.getAttribute('aria-checked') === 'true',
    setValue: (next) => button.setAttribute('aria-checked', next ? 'true' : 'false')
  };
}

export function segmentedControl({ options, value, onChange, full = true, ariaLabel = '' }) {
  const wrapper = h('div.segmented' + (full ? '.segmented--full' : ''), {
    role: 'group',
    'aria-label': ariaLabel || options.map((o) => o.label).join(' / ')
  });
  const buttons = options.map((option) => {
    const button = h('button.segmented__item', {
      type: 'button',
      'aria-pressed': String(option.value) === String(value) ? 'true' : 'false',
      on: {
        click: () => {
          buttons.forEach((btn) => btn.setAttribute('aria-pressed', 'false'));
          button.setAttribute('aria-pressed', 'true');
          if (typeof onChange === 'function') onChange(option.value);
        }
      }
    }, option.label);
    wrapper.appendChild(button);
    return button;
  });
  return {
    el: wrapper,
    setValue(next) {
      buttons.forEach((btn, index) => {
        btn.setAttribute('aria-pressed', String(options[index].value) === String(next) ? 'true' : 'false');
      });
    }
  };
}

export function chipRow({ options, value, onChange, multi = false, values = [] }) {
  const row = h('div.chip-row', { role: 'group' });
  const buttons = [];
  const selected = new Set(multi ? values : [value]);
  options.forEach((option) => {
    const button = h('button.chip', {
      type: 'button',
      'aria-pressed': selected.has(option.value) ? 'true' : 'false',
      on: {
        click: () => {
          if (multi) {
            if (selected.has(option.value)) selected.delete(option.value);
            else selected.add(option.value);
            button.setAttribute('aria-pressed', selected.has(option.value) ? 'true' : 'false');
            if (typeof onChange === 'function') onChange(Array.from(selected));
          } else {
            selected.clear();
            selected.add(option.value);
            buttons.forEach((btn) => btn.setAttribute('aria-pressed', 'false'));
            button.setAttribute('aria-pressed', 'true');
            if (typeof onChange === 'function') onChange(option.value);
          }
        }
      }
    }, option.color ? h('span.chip__dot', { style: { '--swatch-color': `var(--label-${option.color})`, background: `var(--label-${option.color})` } }) : null, option.label);
    buttons.push(button);
    row.appendChild(button);
  });
  return {
    el: row,
    setValue(next) {
      selected.clear();
      selected.add(next);
      buttons.forEach((btn, index) => {
        btn.setAttribute('aria-pressed', selected.has(options[index].value) ? 'true' : 'false');
      });
    },
    getValue: () => Array.from(selected)
  };
}

export function colorPicker({ value = 'purple', onChange }) {
  const row = h('div.swatch-row', { role: 'group', 'aria-label': t('common.color') });
  const buttons = COLOR_NAMES.map((name) => {
    const button = h('button.swatch', {
      type: 'button',
      'aria-pressed': name === value ? 'true' : 'false',
      'aria-label': t(`color.${name}`),
      title: t(`color.${name}`),
      style: { '--swatch-color': `var(--label-${name})`, background: `var(--label-${name})` },
      dataset: { color: name },
      on: {
        click: () => {
          buttons.forEach((btn) => btn.setAttribute('aria-pressed', 'false'));
          button.setAttribute('aria-pressed', 'true');
          if (typeof onChange === 'function') onChange(name);
        }
      }
    });
    row.appendChild(button);
    return button;
  });
  return {
    el: row,
    getValue: () => {
      const active = buttons.find((btn) => btn.getAttribute('aria-pressed') === 'true');
      return active ? active.dataset.color : 'purple';
    }
  };
}

const FREQ_OPTIONS = () => [
  { value: 'none', label: t('recurrence.none') },
  { value: 'daily', label: t('recurrence.daily') },
  { value: 'weekly', label: t('recurrence.weekly') },
  { value: 'monthly', label: t('recurrence.monthly') },
  { value: 'yearly', label: t('recurrence.yearly') }
];

/** Repeat picker: frequency + interval + optional end date. */
export function recurrenceFields(recurrence = {}) {
  const freq = freqSelect(recurrence.freq || 'none');
  const interval = textField({
    label: t('recurrence.interval'),
    value: String(recurrence.interval || 1),
    type: 'number',
    min: '1',
    max: '99'
  });
  const until = dateField({ label: t('recurrence.until'), value: recurrence.until || '' });
  const extras = h('div', { hidden: !recurrence.freq || recurrence.freq === 'none' }, interval.el, until.el);

  function sync() {
    extras.hidden = freq.getValue() === 'none';
  }
  freq.select.addEventListener('change', sync);
  sync();

  return {
    el: h('div', null, freq.el, extras),
    getValue() {
      return {
        freq: freq.getValue(),
        interval: Math.max(1, Math.min(99, Number(interval.getValue()) || 1)),
        until: until.getValue()
      };
    }
  };
}

export function freqSelect(value) {
  return selectField({ label: t('common.repeat'), options: FREQ_OPTIONS(), value });
}

export function dateTimeFields({ date = toDateKey(new Date()), time = toTimeInput(new Date()), labelDate, labelTime }) {
  const dateFieldApi = dateField({ label: labelDate || t('common.date'), value: date, required: true });
  const timeFieldApi = timeField({ label: labelTime || t('common.time'), value: time, required: true });
  return {
    el: h('div.row', { style: { gap: '12px', alignItems: 'flex-start' } }, h('div.grow', null, dateFieldApi.el), h('div.grow', null, timeFieldApi.el)),
    getDate: () => dateFieldApi.getValue(),
    getTime: () => timeFieldApi.getValue(),
    setDate: dateFieldApi.setValue,
    setTime: timeFieldApi.setValue,
    setError(message) {
      dateFieldApi.setError(message);
    }
  };
}

export function categoryChips({ categories, value, onChange, allowEmpty = true }) {
  const options = (allowEmpty ? [{ value: '', label: t('common.none') }] : []).concat(
    categories.map((category) => ({ value: category.id, label: category.name, color: category.color }))
  );
  return chipRow({ options, value: value || '', onChange });
}

export function progressBar(percent, { small = false, success = false } = {}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return h(
    'div.linear-progress' + (small ? '.linear-progress--sm' : '') + (success ? '.linear-progress--success' : ''),
    {
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(value)
    },
    h('div.linear-progress__value', { style: { width: `${value}%` } })
  );
}

export function primaryButton(label, onClick, { icon = '', variant = 'filled', block = false, type = 'button' } = {}) {
  return h(
    `button.btn.btn--${variant}` + (block ? '.btn--block' : ''),
    { type, on: { click: onClick } },
    icon ? h('span.btn__icon', null, iconNode(icon)) : null,
    label
  );
}

export function emptyState({ icon = 'info', title, text, action }) {
  return h(
    'div.empty-state',
    null,
    h('div.empty-state__icon', null, iconNode(icon)),
    h('p.empty-state__title', { text: title }),
    text ? h('p.empty-state__text', { text }) : null,
    action || null
  );
}

export function sectionTitle(text, actionNode) {
  return h('h2.section-title', null, h('span', { text }), actionNode || null);
}
