/**
 * Reminder engine.
 *
 * Android: the full reminder set is mirrored into Kotlin, which schedules real
 *          AlarmManager alarms + NotificationManager notifications. Firing is
 *          recorded in native SQLite and pulled back into the store.
 * Web:     reminders are checked while the page is open (Notification API).
 *          The UI states this limitation explicitly — no fake background work.
 */

import { nextOccurrence, parseLocal } from './dates.js';
import { generateId } from './validate.js';
import { REMINDER_HISTORY_LIMIT } from '../data/defaults.js';

const TICK_MS = 30 * 1000;

export class ReminderCenter {
  constructor({ store, platform, onChange, onFired, onError }) {
    this.store = store;
    this.platform = platform;
    this.onChange = onChange || (() => {});
    this.onFired = onFired || (() => {});
    this.onError = onError || (() => {});
    this.timer = 0;
    this.started = false;
    this.lastSync = { scheduled: 0, at: 0 };
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') this.tick();
    };
  }

  get isNative() {
    return !!this.platform.isNative;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.platform.onFired && this.platform.onFired((payload) => this.handleNativeFired(payload));
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    this.pullNativeHistory();
  }

  stop() {
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }

  /** Next scheduled moment for a reminder (Date) or null. */
  nextFor(reminder, after = new Date()) {
    if (!reminder.at) return null;
    const base = parseLocal(reminder.at);
    if (!base) return null;
    if (reminder.recurrence && reminder.recurrence.freq !== 'none') {
      return nextOccurrence(reminder.at, reminder.recurrence, after);
    }
    return base.getTime() > after.getTime() ? base : null;
  }

  async tick() {
    try {
      if (this.isNative) {
        await this.pushToNative();
      } else {
        this.checkWebDue();
      }
    } catch (error) {
      this.onError(error);
    }
  }

  /** Sends the reminder set to Kotlin; safe to call on every data change. */
  async pushToNative() {
    const reminders = this.store
      .all('reminders')
      .map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        notes: reminder.notes,
        at: reminder.at,
        recurrence: reminder.recurrence,
        enabled: reminder.enabled
      }))
      .filter((reminder) => reminder.at);
    const result = await this.platform.syncReminders(reminders);
    if (result && result.ok) {
      this.lastSync = { scheduled: result.scheduled || 0, at: Date.now(), exact: result.exact };
    }
    return result;
  }

  checkWebDue() {
    const now = new Date();
    this.store.all('reminders').forEach((reminder) => {
      if (!reminder.enabled) return;
      const base = parseLocal(reminder.at);
      if (!base) return;
      const recurring = reminder.recurrence && reminder.recurrence.freq !== 'none';
      let due = null;
      if (recurring) {
        const after = reminder.lastFiredAt ? new Date(reminder.lastFiredAt) : new Date(base.getTime() - 1000);
        const next = nextOccurrence(reminder.at, reminder.recurrence, after);
        if (next && next.getTime() <= now.getTime()) due = next;
      } else if (base.getTime() <= now.getTime() && !reminder.lastFiredAt) {
        due = base;
      }
      if (!due) return;
      this.fire(reminder, due);
    });
  }

  async fire(reminder, when) {
    const shown = await this.platform.showNotification({
      title: reminder.title,
      body: reminder.notes || '',
      tag: reminder.id
    });
    this.addHistory({
      reminderId: reminder.id,
      title: reminder.title,
      firedAt: (when || new Date()).toISOString(),
      action: shown ? 'fired' : 'missed'
    });
    const recurring = reminder.recurrence && reminder.recurrence.freq !== 'none';
    this.store.put('reminders', {
      ...reminder,
      enabled: recurring ? reminder.enabled : false,
      lastFiredAt: new Date().toISOString()
    });
    this.onFired(reminder, shown);
    this.onChange('reminders');
  }

  handleNativeFired(payload) {
    if (!payload || !payload.reminderId) return;
    const reminder = this.store.get('reminders', payload.reminderId);
    this.addHistory({
      reminderId: payload.reminderId,
      title: payload.title || (reminder ? reminder.title : ''),
      firedAt: payload.firedAt || new Date().toISOString(),
      action: payload.action === 'snoozed' ? 'snoozed' : 'fired'
    });
    if (reminder) {
      const recurring = reminder.recurrence && reminder.recurrence.freq !== 'none';
      this.store.put('reminders', {
        ...reminder,
        enabled: recurring ? reminder.enabled : false,
        lastFiredAt: payload.firedAt || new Date().toISOString()
      });
    }
    this.onFired(reminder, true);
    this.onChange('reminders');
  }

  addHistory(entry) {
    const existing = this.store.find(
      'history',
      (item) => item.reminderId === entry.reminderId && item.firedAt === entry.firedAt
    );
    if (existing.length) return;
    this.store.put('history', {
      id: generateId(),
      reminderId: entry.reminderId,
      title: entry.title,
      firedAt: entry.firedAt,
      action: entry.action
    });
    const all = this.store.all('history');
    if (all.length > REMINDER_HISTORY_LIMIT) {
      const sorted = all.slice().sort((a, b) => b.firedAt.localeCompare(a.firedAt));
      const extra = sorted.slice(REMINDER_HISTORY_LIMIT).map((item) => item.id);
      this.store.removeMany('history', extra);
    }
  }

  /** Merges native notification history into the store (deduplicated). */
  async pullNativeHistory() {
    if (!this.isNative) return;
    try {
      const items = await this.platform.firedHistory();
      let added = 0;
      items.forEach((item) => {
        if (!item || !item.reminderId || !item.firedAt) return;
        const exists = this.store.find(
          'history',
          (entry) => entry.reminderId === item.reminderId && Math.abs(Date.parse(entry.firedAt) - Date.parse(item.firedAt)) < 60000
        );
        if (exists.length) return;
        this.store.put('history', {
          id: generateId(),
          reminderId: item.reminderId,
          title: item.title || '',
          firedAt: item.firedAt,
          action: item.action === 'snoozed' ? 'snoozed' : item.action === 'dismissed' ? 'dismissed' : 'fired'
        });
        added += 1;
      });
      if (added) this.onChange('history');
    } catch (error) {
      this.onError(error);
    }
  }

  async sendTest() {
    if (this.isNative) {
      const shown = await this.platform.showNotification({
        title: 'DELIES',
        body: this.store.getSettings() ? '' : '',
        tag: 'test'
      });
      return shown;
    }
    return this.platform.showNotification({
      title: 'DELIES',
      body: 'Тестовое уведомление',
      tag: 'test'
    });
  }
}
