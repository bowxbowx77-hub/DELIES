/** Reminders: list with toggles, permission handling, history, native sync. */

import { h, clear } from '../core/dom.js';
import { iconNode } from '../core/icons.js';
import { t } from '../core/i18n.js';
import { formatDateTime, formatTime, formatDate } from '../core/dates.js';
import { reminderRow } from './shared.js';
import { openReminderDialog, deleteEntity } from '../ui/forms.js';
import { emptyState, iconButton, primaryButton, sectionTitle } from '../ui/controls.js';

export default function remindersView(ctx) {
  let permissionStatus = ctx.platform.notifyStatus();

  function statusText(status) {
    if (status === 'granted') return t('settings.permissionGranted');
    if (status === 'denied') return t('settings.permissionDenied');
    if (status === 'unsupported') return t('settings.permissionUnsupported');
    return t('settings.permissionDefault');
  }

  function permissionCard() {
    if (permissionStatus === 'granted') return null;
    const card = h(
      'section.card.card--accent',
      null,
      h(
        'div.card__header',
        null,
        iconNode('bellOff'),
        h('div.card__title', { text: permissionStatus === 'denied' ? t('reminders.permissionDenied') : t('reminders.permissionNeeded') })
      ),
      h('p.card__body', { text: statusText(permissionStatus) }),
      permissionStatus !== 'unsupported'
        ? primaryButton(t('reminders.grant'), async () => {
            const result = await ctx.platform.requestNotifications();
            permissionStatus = result;
            if (result === 'granted') ctx.toast(t('toast.permissionGranted'));
            else ctx.toast(t('toast.permissionDenied'), { error: true });
            ctx.refresh();
          }, { variant: 'filled', icon: 'bell', block: true })
        : null
    );
    card.style.marginTop = '12px';
    return card;
  }

  function historySection() {
    const entries = ctx.store
      .all('history')
      .slice()
      .sort((a, b) => b.firedAt.localeCompare(a.firedAt))
      .slice(0, 20);
    const wrapper = h('section');
    wrapper.appendChild(sectionTitle(t('reminders.history')));
    if (!entries.length) {
      wrapper.appendChild(h('div.card.card--flat', null, h('p.card__body', { text: t('reminders.historyEmpty') })));
      return wrapper;
    }
    const list = h('div.list');
    entries.forEach((entry) => {
      list.appendChild(
        h(
          'div.list-item',
          null,
          h('span.list-item__leading', null, iconNode(entry.action === 'fired' ? 'bell' : 'bellOff')),
          h(
            'div.list-item__content',
            null,
            h('div.list-item__headline', { text: entry.title || t('common.untitled') }),
            h('div.list-item__supporting', {
              text: `${formatDateTime(entry.firedAt, ctx.getLang())} · ${t(
                entry.action === 'snoozed'
                  ? 'reminders.snoozed'
                  : entry.action === 'dismissed'
                    ? 'reminders.dismissed'
                    : entry.action === 'missed'
                      ? 'reminders.missed'
                      : 'reminders.fired'
              )}`
            })
          )
        )
      );
    });
    wrapper.appendChild(list);
    return wrapper;
  }

  async function testNotification() {
    if (permissionStatus !== 'granted') {
      permissionStatus = await ctx.platform.requestNotifications();
    }
    const ok = await ctx.reminders.sendTest();
    ctx.toast(ok ? t('toast.testSent') : t('toast.permissionDenied'), { error: !ok });
  }

  function render() {
    const root = h('div.stack');
    const reminders = ctx.store.all('reminders').sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return (a.at || '').localeCompare(b.at || '');
    });

    const perm = permissionCard();
    if (perm) root.appendChild(perm);

    if (ctx.platform.isNative) {
      const info = ctx.reminders.lastSync;
      root.appendChild(
        h(
          'div.card.card--flat.row',
          { style: { justifyContent: 'space-between' } },
          h('p.card__body', { text: t('reminders.nativeScheduled', { n: info.scheduled || 0 }) }),
          iconButton('refresh', t('common.more'), async () => {
            await ctx.reminders.pushToNative();
            ctx.refresh();
          }, { small: true })
        )
      );
    } else {
      root.appendChild(h('div.card.card--flat', null, h('p.card__body', { text: t('reminders.webLimit') })));
    }

    if (!reminders.length) {
      root.appendChild(
        emptyState({
          icon: 'bell',
          title: t('reminders.emptyTitle'),
          text: t('reminders.emptyText'),
          action: primaryButton(t('reminders.new'), () => openReminderDialog(ctx), {
            variant: 'tonal',
            icon: 'plus',
            block: true
          })
        })
      );
    } else {
      const list = h('div.list');
      reminders.forEach((reminder) => {
        list.appendChild(
          h(
            'div.row',
            { style: { alignItems: 'stretch' } },
            h(
              'div.grow',
              null,
              reminderRow(ctx, reminder, (item) => openReminderDialog(ctx, { reminder: item }))
            ),
            h(
              'div.row',
              { style: { paddingRight: '8px' } },
              iconButton(
                'trash',
                t('common.delete'),
                () => deleteEntity(ctx, 'reminders', reminder, { title: t('common.delete'), text: reminder.title }),
                { small: true }
              )
            )
          )
        );
      });
      root.appendChild(list);
    }

    root.appendChild(
      primaryButton(t('reminders.test'), testNotification, { variant: 'outlined', icon: 'bell', block: true })
    );

    if (ctx.platform.isNative) {
      const exact = ctx.capabilitiesCache || {};
      if (exact.exactAlarms === false) {
        const card = h(
          'section.card',
          null,
          h('div.card__header', null, iconNode('clock'), h('div.card__title', { text: t('reminders.exactAlarmTitle') })),
          h('p.card__body', { text: t('reminders.exactAlarmText') }),
          primaryButton(t('reminders.exactAlarmAllow'), async () => {
            await ctx.platform.requestExactAlarms();
          }, { variant: 'tonal', block: true })
        );
        card.style.marginTop = '12px';
        root.appendChild(card);
      }
    }

    root.appendChild(historySection());
    return root;
  }

  return {
    render,
    onMount() {
      // Refresh the permission state (it can change while the app is running).
      permissionStatus = ctx.platform.notifyStatus();
    },
    fab() {
      return { icon: 'plus', label: t('reminders.new'), onClick: () => openReminderDialog(ctx) };
    },
    appBarActions() {
      return [
        iconButton('plus', t('reminders.new'), () => openReminderDialog(ctx), { small: true })
      ];
    }
  };
}
