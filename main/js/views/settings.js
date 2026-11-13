/** Settings: appearance, language, notifications, backup, about. */

import { h, clear } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t, LANGUAGES } from '../core/i18n.js';
import { APP_VERSION } from '../data/defaults.js';
import { buildBackup, backupFileName, serializeBackup, parseBackup, readTextFile, openFilePicker } from '../core/backup.js';
import { segmentedControl, switchRow, textField, selectField, primaryButton, iconButton, sectionTitle } from '../ui/controls.js';
import { generateId } from '../core/validate.js';
import { seedCategories } from '../data/defaults.js';

export async function exportData(ctx) {
  const snapshot = buildBackup(ctx.store);
  const filename = backupFileName();
  try {
    const result = await ctx.platform.saveTextFile(filename, serializeBackup(snapshot));
    if (result && result.ok) {
      ctx.toast(t('toast.exported'));
      return true;
    }
    ctx.toast((result && result.error) || t('errors.exportFailed'), { error: true });
    return false;
  } catch (error) {
    ctx.reportError(error, t('errors.exportFailed'));
    return false;
  }
}

export async function applyImport(ctx, text) {
  const parsed = parseBackup(text);
  if (!parsed.ok) {
    ctx.toast(parsed.error, { error: true });
    return false;
  }
  try {
    await ctx.store.replaceAll(parsed.data, parsed.settings ? { ...parsed.settings } : null);
  } catch (error) {
    ctx.reportError(error, t('errors.importFailed'));
    return false;
  }
  if (parsed.settings) {
    await ctx.updateSettings({
      theme: parsed.settings.theme,
      lang: parsed.settings.lang,
      notifications: parsed.settings.notifications,
      weekStart: parsed.settings.weekStart,
      userName: parsed.settings.userName
    });
  } else {
    ctx.refresh();
  }
  if (ctx.reminders) await ctx.reminders.pushToNative();
  ctx.toast(t('toast.imported'));
  return true;
}

async function importData(ctx) {
  const ok = await ctx.confirm({ title: t('settings.import'), text: t('settings.importConfirm'), danger: true });
  if (!ok) return;
  let file = null;
  try {
    file = await openFilePicker('application/json,.json');
  } catch {
    file = null;
  }
  if (!file) return;
  try {
    const text = await readTextFile(file);
    await applyImport(ctx, text);
  } catch (error) {
    ctx.toast(error && error.message ? error.message : t('errors.importFailed'), { error: true });
  }
}

async function resetAll(ctx) {
  const ok = await ctx.confirm({ title: t('settings.reset'), text: t('settings.resetConfirm'), danger: true });
  if (!ok) return;
  await ctx.store.clearAll();
  const lang = ctx.getLang();
  seedCategories(lang).forEach((category) => {
    ctx.store.put('categories', { id: generateId(), scope: category.scope, name: category.name, color: category.color });
  });
  await ctx.store.flush();
  if (ctx.platform.isNative) await ctx.reminders.pushToNative();
  ctx.toast(t('toast.reset'));
  ctx.refresh();
}

export default function settingsView(ctx) {
  let exactStatus = null;

  function themeOptions() {
    return [
      { value: 'system', label: t('settings.themeSystem') },
      { value: 'light', label: t('settings.themeLight') },
      { value: 'dark', label: t('settings.themeDark') }
    ];
  }

  function row(icon, title, desc, trailing) {
    return h(
      'div.settings-row',
      null,
      h('span.settings-row__icon', null, iconNode(icon)),
      h('div.settings-row__text', null, h('div.settings-row__title', { text: title }), desc ? h('div.settings-row__desc', { text: desc }) : null),
      trailing || null
    );
  }

  function permissionLabel() {
    const status = ctx.platform.notifyStatus();
    if (status === 'granted') return t('settings.permissionGranted');
    if (status === 'denied') return t('settings.permissionDenied');
    if (status === 'unsupported') return t('settings.permissionUnsupported');
    return t('settings.permissionDefault');
  }

  function render() {
    const root = h('div.stack');
    const settings = ctx.settings;

    // --- appearance ------------------------------------------------------
    const theme = segmentedControl({
      options: themeOptions(),
      value: settings.theme,
      onChange: (value) => ctx.updateSettings({ theme: value })
    });
    const language = selectField({
      label: t('settings.language'),
      value: settings.lang,
      options: LANGUAGES.map((lang) => ({ value: lang.code, label: lang.label }))
    });
    language.select.addEventListener('change', () => ctx.updateSettings({ lang: language.getValue() }));

    const weekStart = segmentedControl({
      options: [
        { value: 1, label: t('settings.weekMonday') },
        { value: 0, label: t('settings.weekSunday') }
      ],
      value: settings.weekStart,
      onChange: (value) => ctx.updateSettings({ weekStart: Number(value) })
    });

    root.appendChild(sectionTitle(t('settings.appearance')));
    root.appendChild(
      h(
        'div.settings-group',
        null,
        h('div.settings-group__title', { text: t('settings.theme') }),
        h('div.stack', { style: { padding: '12px 16px' } }, theme.el),
        h('div.stack', { style: { padding: '0 16px 16px' } }, language.el),
        h('div.settings-group__title', { text: t('settings.weekStart') }),
        h('div.stack', { style: { padding: '0 16px 16px' } }, weekStart.el)
      )
    );

    // --- profile ---------------------------------------------------------
    const nameField = textField({ label: t('settings.name'), value: settings.userName, maxLength: 40, hint: t('settings.nameDesc') });
    nameField.input.addEventListener('change', () => ctx.updateSettings({ userName: nameField.getValue() }));
    root.appendChild(sectionTitle(t('settings.profile')));
    root.appendChild(h('div.settings-group', null, h('div.stack', { style: { padding: '16px' } }, nameField.el)));

    // --- notifications ---------------------------------------------------
    const notifSwitch = switchRow({
      title: t('settings.notifications'),
      desc: t('settings.notificationsDesc'),
      checked: !!settings.notifications,
      onChange: async (checked) => {
        await ctx.updateSettings({ notifications: checked });
        if (checked && ctx.platform.notifyStatus() !== 'granted') {
          const status = await ctx.platform.requestNotifications();
          if (status === 'granted') ctx.toast(t('toast.permissionGranted'));
        }
      }
    });

    const permissionRow = row(
      'bell',
      t('settings.permission'),
      permissionLabel(),
      h(
        'button.btn.btn--text.btn--small',
        {
          type: 'button',
          disabled: ctx.platform.notifyStatus() === 'unsupported',
          on: {
            click: async () => {
              const status = await ctx.platform.requestNotifications();
              if (status === 'granted') ctx.toast(t('toast.permissionGranted'));
              else if (status !== 'unsupported') ctx.toast(t('toast.permissionDenied'), { error: true });
              ctx.refresh();
            }
          }
        },
        t('settings.requestPermission')
      )
    );

    const group = h('div.settings-group');
    group.appendChild(notifSwitch.el);
    group.appendChild(permissionRow);
    if (ctx.platform.isNative) {
      const exactRow = row(
        'clock',
        t('settings.exactAlarms'),
        t('settings.exactAlarmsDesc'),
        h(
          'button.btn.btn--text.btn--small',
          {
            type: 'button',
            on: {
              click: async () => {
                const result = await ctx.platform.requestExactAlarms();
                if (result.unsupported) ctx.toast(t('errors.notificationUnsupported'), { error: true });
              }
            }
          },
          t('reminders.exactAlarmAllow')
        )
      );
      exactRow.dataset.exactStatus = exactStatus === null ? 'unknown' : exactStatus.allowed ? 'allowed' : 'denied';
      if (exactStatus && !exactStatus.allowed) group.appendChild(exactRow);
    }
    root.appendChild(sectionTitle(t('settings.notifications')));
    root.appendChild(group);

    // --- data ------------------------------------------------------------
    const exportRow = h(
      'button.settings-row',
      { type: 'button', on: { click: () => exportData(ctx) } },
      h('span.settings-row__icon', null, iconNode('download')),
      h('div.settings-row__text', null,
        h('div.settings-row__title', { text: t('settings.export') }),
        h('div.settings-row__desc', { text: t('settings.exportDesc') })),
      iconNode('chevronRight')
    );
    const importRow = h(
      'button.settings-row',
      { type: 'button', on: { click: () => importData(ctx) } },
      h('span.settings-row__icon', null, iconNode('upload')),
      h('div.settings-row__text', null,
        h('div.settings-row__title', { text: t('settings.import') }),
        h('div.settings-row__desc', { text: t('settings.importDesc') })),
      iconNode('chevronRight')
    );
    const categoriesRow = h(
      'button.settings-row',
      { type: 'button', on: { click: () => ctx.openCategories() } },
      h('span.settings-row__icon', null, iconNode('folder')),
      h('div.settings-row__text', null, h('div.settings-row__title', { text: t('category.manage') })),
      iconNode('chevronRight')
    );
    const resetRow = h(
      'button.settings-row',
      { type: 'button', on: { click: () => resetAll(ctx) } },
      h('span.settings-row__icon', null, iconNode('trash')),
      h('div.settings-row__text', null,
        h('div.settings-row__title.text-error', { text: t('settings.reset') }),
        h('div.settings-row__desc', { text: t('settings.resetDesc') }))
    );

    root.appendChild(sectionTitle(t('settings.data')));
    root.appendChild(h('div.settings-group', null, exportRow, importRow, categoriesRow, resetRow));

    // --- about -----------------------------------------------------------
    const info = ctx.platform.appInfo();
    const storageLabel =
      ctx.store.storageKind === 'indexeddb'
        ? t('settings.storageIndexedDb')
        : ctx.store.storageKind === 'localstorage'
          ? t('settings.storageLocalStorage')
          : t('settings.storageMemory');

    root.appendChild(sectionTitle(t('settings.about')));
    root.appendChild(
      h(
        'section.card.about-card',
        null,
        h('div.about-card__logo', null, iconNode('target')),
        h('div.about-card__name', { text: 'DELIES' }),
        h('div.about-card__version', { text: `${t('settings.version')} ${info.appVersion || APP_VERSION}` }),
        h('p.about-card__text', { text: t('app.tagline') }),
        h(
          'div.stack',
          { style: { marginTop: '16px', textAlign: 'left' } },
          row('web', t('settings.platform'), ctx.platform.isNative ? t('settings.platformAndroid') : t('settings.platformWeb')),
          row('database', t('settings.storage'), storageLabel),
          ctx.platform.isNative
            ? row('shield', t('settings.nativeBridge'), t('settings.nativeBridgeOk'), h('span.bridge-status', null, h('span.bridge-status__dot.bridge-status__dot--ok')))
            : row('shield', t('settings.nativeBridge'), t('settings.nativeBridgeOff'), h('span.bridge-status', null, h('span.bridge-status__dot'))),
          info.device ? row('android', 'Device', String(info.device)) : null
        ),
        h('p.about-card__text', { text: t('settings.privacy') }),
        h('p.about-card__version', { text: t('settings.licence') })
      )
    );

    return root;
  }

  return {
    render,
    async onMount() {
      if (ctx.platform.isNative && ctx.platform.exactAlarmStatus) {
        try {
          exactStatus = await ctx.platform.exactAlarmStatus();
          ctx.refresh();
        } catch {
          /* ignore: the section simply stays hidden */
        }
      }
    },
    appBarActions() {
      return [iconButton('refresh', t('common.more'), () => ctx.refresh(), { small: true })];
    }
  };
}
