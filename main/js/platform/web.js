/**
 * Web platform adapter: uses the browser Notification API, Blob downloads and
 * history-based back navigation. No network access of any kind.
 */

import { downloadTextFile } from '../core/backup.js';
import { t } from '../core/i18n.js';

function notificationApi() {
  return typeof Notification !== 'undefined' ? Notification : null;
}

export function createWebPlatform(env = {}) {
  const win = env.window || (typeof window !== 'undefined' ? window : null);
  const nav = env.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const backHandlers = new Set();

  return {
    kind: 'web',
    isNative: false,

    appInfo() {
      return {
        platform: 'web',
        appVersion: '2.0.0',
        bridge: 'none',
        userAgent:
          nav && typeof nav.userAgent === 'string' ? nav.userAgent.slice(0, 180) : 'n/a'
      };
    },

    capabilities() {
      return {
        notifications: !!notificationApi(),
        nativeReminders: false,
        exactAlarms: false,
        fileExport: true,
        fileImport: true,
        vibration: !!(nav && typeof nav.vibrate === 'function')
      };
    },

    notifyStatus() {
      const api = notificationApi();
      if (!api) return 'unsupported';
      return api.permission; // 'granted' | 'denied' | 'default'
    },

    async requestNotifications() {
      const api = notificationApi();
      if (!api) return 'unsupported';
      try {
        const result = await api.requestPermission();
        return result;
      } catch {
        return 'denied';
      }
    },

    async showNotification({ title, body, tag }) {
      const api = notificationApi();
      if (!api || api.permission !== 'granted') return false;
      try {
        // eslint-disable-next-line no-new
        new api(title, {
          body: body || '',
          tag: tag || undefined,
          icon: 'assets/icon-192.svg',
          badge: 'assets/icon-192.svg',
          lang: document.documentElement.lang || 'ru'
        });
        return true;
      } catch {
        return false;
      }
    },

    /** Web has no background scheduler — reminders are timed while the tab is open. */
    async syncReminders() {
      return { scheduled: 0, native: false };
    },

    async cancelReminder() {
      return { ok: true };
    },

    async firedHistory() {
      return [];
    },

    async saveTextFile(filename, content) {
      downloadTextFile(filename, content);
      return { ok: true, method: 'download' };
    },

    async shareText() {
      return { ok: false, error: t('errors.exportFailed') };
    },

    async setThemeMode() {
      return { ok: true };
    },

    async exactAlarmStatus() {
      return { supported: false, allowed: false };
    },

    async requestExactAlarms() {
      return { ok: false, unsupported: true };
    },

    vibrate(ms = 30) {
      try {
        if (nav && typeof nav.vibrate === 'function') nav.vibrate(ms);
      } catch {
        /* ignore */
      }
    },

    onFired() {
      return () => {};
    },

    /** Browser: the shell router handles the back gesture through history. */
    attachBackHandler(handler) {
      backHandlers.add(handler);
      return () => backHandlers.delete(handler);
    },

    handleHardwareBack() {
      for (const handler of Array.from(backHandlers)) {
        if (handler()) return true;
      }
      return false;
    },

    dispose() {
      backHandlers.clear();
    },

    _win: win
  };
}
