/**
 * Material 3 overlays: dialogs, bottom sheets and snackbars.
 * Each overlay traps focus, restores it on close, and supports Escape.
 */

import { h, clear, trapFocus } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';

const stack = [];
let snackbarId = 0;

function host(selector) {
  return document.querySelector(selector);
}

function lockScroll(locked) {
  document.documentElement.style.overflow = locked ? 'hidden' : '';
}

function refreshLock() {
  const anyDialog = stack.some((entry) => entry.type === 'dialog' || entry.type === 'sheet');
  lockScroll(anyDialog);
}

function onKeydown(event) {
  if (event.key !== 'Escape' || !stack.length) return;
  const top = stack[stack.length - 1];
  if (top.dismissible) {
    event.preventDefault();
    top.close();
  }
}

document.addEventListener('keydown', onKeydown);

/**
 * @param {Object} options
 * @param {string} options.title
 * @param {string} [options.text]
 * @param {string} [options.icon]
 * @param {Node} [options.content]
 * @param {Array} [options.actions] {label, variant, value, keepOpen}
 * @param {boolean} [options.dismissible]
 * @param {Function} [options.onClose]
 */
export function showDialog(options = {}) {
  const dialogHost = host('#dialogHost');
  if (!dialogHost) return { close() {}, el: null };
  const previousActive = document.activeElement;
  const dismissible = options.dismissible !== false;

  const container = h('div.dialog-wrap');
  const dialog = h('div.dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title || t('app.name') });

  if (options.icon) dialog.appendChild(h('div.dialog__icon', null, iconNode(options.icon)));
  if (options.title) dialog.appendChild(h('h2.dialog__title', { text: options.title }));
  if (options.text) dialog.appendChild(h('p.dialog__text', { text: options.text }));

  let body = null;
  if (options.content) {
    body = h('div.dialog__body');
    body.appendChild(options.content);
    dialog.appendChild(body);
  }

  const entry = {
    type: 'dialog',
    dismissible,
    close(result) {
      close(result);
    }
  };

  const actionsRow = h('div.dialog__actions' + (options.stacked ? '.dialog__actions--stacked' : ''));
  const actionButtons = [];

  (options.actions || []).forEach((action) => {
    const variant = action.variant === 'filled' ? 'btn--filled' : action.variant === 'danger' ? 'btn--danger' : 'btn--text';
    const button = h(
      `button.btn.${variant}`,
      {
        type: 'button',
        on: {
          click: async () => {
            if (typeof action.onClick === 'function') {
              // A handler returns false to keep the dialog open (validation
              // failure); any other result closes it.
              const keep = await action.onClick(entry);
              if (keep === false || action.keepOpen === true) return;
            }
            close(action.value);
          }
        }
      },
      action.label
    );
    actionButtons.push(button);
    actionsRow.appendChild(button);
  });
  if (actionsRow.childNodes.length) dialog.appendChild(actionsRow);

  container.appendChild(dialog);
  const scrim = h('div.dialog-scrim', {
    on: {
      click: () => {
        if (dismissible) close();
      }
    }
  });
  dialogHost.appendChild(scrim);
  dialogHost.appendChild(container);
  dialogHost.classList.add('dialog-host--open');

  let resolveFn;
  const promise = new Promise((resolve) => {
    resolveFn = resolve;
  });

  let released = false;
  const release = trapFocus(dialog, previousActive);

  function close(result) {
    if (released) return;
    released = true;
    release();
    container.remove();
    if (!dialogHost.querySelector('.dialog-wrap')) {
      scrim.remove();
      dialogHost.classList.remove('dialog-host--open');
    }
    const index = stack.indexOf(entry);
    if (index !== -1) stack.splice(index, 1);
    refreshLock();
    if (typeof options.onClose === 'function') options.onClose(result);
    resolveFn(result);
  }

  entry.close = close;
  stack.push(entry);
  refreshLock();

  setTimeout(() => {
    const auto = actionButtons.find((btn) => btn.dataset.autofocus === 'true') || actionButtons[actionButtons.length - 1];
    if (auto) auto.focus();
  }, 30);

  return { close, el: dialog, promise, setError(message) {
    let errorNode = dialog.querySelector('.field__error--dialog');
    if (!errorNode) {
      errorNode = h('p.field__error.field__error--dialog', { role: 'alert' });
      if (body) dialog.insertBefore(errorNode, actionsRow);
      else dialog.appendChild(errorNode);
    }
    errorNode.textContent = message;
  } };
}

/** Simple confirmation dialog → Promise<boolean>. */
export function confirmDialog({ title, text, confirmLabel, cancelLabel, danger = true }) {
  const dialog = showDialog({
    title,
    text,
    icon: danger ? 'alert' : 'info',
    actions: [
      { label: cancelLabel || t('common.cancel'), variant: 'text', value: false },
      { label: confirmLabel || t('common.delete'), variant: danger ? 'danger' : 'filled', value: true }
    ]
  });
  return dialog.promise.then((result) => result === true);
}

/** Bottom sheet with custom content. Returns {close}. */
export function showSheet({ title, content, dismissible = true, onClose }) {
  const sheetHost = host('#sheetHost');
  if (!sheetHost) return { close() {} };
  const previousActive = document.activeElement;
  const sheet = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || t('common.more') });
  sheet.appendChild(h('div.sheet__handle'));
  if (title) sheet.appendChild(h('h2.sheet__title', { text: title }));
  const body = h('div.sheet__content');
  body.appendChild(content);
  sheet.appendChild(body);

  let released = false;
  const release = trapFocus(sheet, previousActive);
  const scrim = h('div.dialog-scrim', {
    on: {
      click: () => {
        if (dismissible) close();
      }
    }
  });
  sheetHost.appendChild(scrim);
  sheetHost.appendChild(sheet);
  sheetHost.classList.add('sheet-host--open');

  const entry = { type: 'sheet', dismissible, close };
  function close() {
    if (released) return;
    released = true;
    release();
    sheet.remove();
    scrim.remove();
    sheetHost.classList.remove('sheet-host--open');
    const index = stack.indexOf(entry);
    if (index !== -1) stack.splice(index, 1);
    refreshLock();
    if (typeof onClose === 'function') onClose();
  }
  stack.push(entry);
  refreshLock();
  return { close, el: sheet };
}

/** Snackbar with optional single action. */
export function showSnackbar(message, { action, onAction, duration = 4000, error = false } = {}) {
  const snackbarHost = host('#snackbarHost');
  if (!snackbarHost) return;
  while (snackbarHost.childNodes.length >= 3) snackbarHost.removeChild(snackbarHost.firstChild);

  snackbarId += 1;
  const id = `snack-${snackbarId}`;
  const node = h(
    'div.snackbar' + (error ? '.snackbar--error' : ''),
    { role: error ? 'alert' : 'status', dataset: { snackbarId: id } },
    h('span.snackbar__text', { text: message })
  );

  const remove = () => {
    node.classList.add('snackbar--out');
    setTimeout(() => node.remove(), 200);
  };

  let timer = 0;
  if (action) {
    node.appendChild(
      h(
        'button.snackbar__action',
        {
          type: 'button',
          on: {
            click: () => {
              clearTimeout(timer);
              remove();
              if (typeof onAction === 'function') onAction();
            }
          }
        },
        action
      )
    );
  }
  snackbarHost.appendChild(node);
  timer = setTimeout(remove, duration);
  return { dismiss: remove };
}

export function closeAllOverlays() {
  const open = stack.slice();
  open.forEach((entry) => {
    if (entry.dismissible) entry.close();
  });
}

export function hasOpenOverlay() {
  return stack.length > 0;
}

export function clearOverlaysForTests() {
  clear(host('#dialogHost') || document.createElement('div'));
  clear(host('#sheetHost') || document.createElement('div'));
  stack.length = 0;
  lockScroll(false);
}
