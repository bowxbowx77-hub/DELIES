/**
 * Android platform adapter.
 *
 * The Kotlin side exposes exactly one entry point (`DELIESNative.call(method,
 * payloadJson)`) that returns a JSON envelope. This adapter is the only code in
 * the web app that talks to it, and only for the allow-listed methods below.
 *
 * Events from Kotlin arrive on `window.DELIESBridge.emit(event, payloadJson)`.
 */

import { APP_VERSION } from '../data/defaults.js';

const REQUEST_TIMEOUT = 8000;

function parseEnvelope(raw) {
  if (typeof raw !== 'string' || !raw) return { ok: false, error: 'empty bridge response' };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'bad bridge response' };
    return parsed;
  } catch {
    return { ok: false, error: 'bridge response is not JSON' };
  }
}

export function nativeAvailable(scope) {
  const win = scope || (typeof window !== 'undefined' ? window : null);
  return !!(win && win.DELIESNative && typeof win.DELIESNative.call === 'function');
}

export function createNativePlatform(env = {}) {
  const win = env.window || (typeof window !== 'undefined' ? window : null);
  const bridge = win.DELIESNative;
  const listeners = new Map();
  const backHandlers = new Set();
  const pending = new Map();
  let requestCounter = 0;

  function call(method, payload) {
    let raw;
    try {
      raw = bridge.call(String(method), JSON.stringify(payload === undefined ? {} : payload));
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : 'bridge call failed' };
    }
    return parseEnvelope(raw);
  }

  function emit(event, payload) {
    (listeners.get(event) || []).forEach((fn) => {
      try {
        fn(payload);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[DELIES] native event handler failed', error);
      }
    });
  }

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event).delete(handler);
  }

  // Kotlin calls this to push events (reminder fired, permission result, import).
  win.DELIESBridge = {
    emit(eventName, payloadJson) {
      let payload = null;
      try {
        payload = payloadJson ? JSON.parse(payloadJson) : null;
      } catch {
        payload = null;
      }
      if (eventName === 'notification-permission') {
        pending.delete('notifications');
      }
      emit(String(eventName), payload);
    },
    // Kotlin asks whether the web layer consumed the hardware back button.
    handleBack() {
      for (const handler of Array.from(backHandlers)) {
        try {
          if (handler()) return 'true';
        } catch {
          /* keep checking other handlers */
        }
      }
      return 'false';
    }
  };

  const info = call('info', {});
  const infoData = info.ok && info.data ? info.data : {};

  return {
    kind: 'android',
    isNative: true,
    requestId: () => {
      requestCounter += 1;
      return `req-${requestCounter}`;
    },

    appInfo() {
      return {
        platform: 'android',
        appVersion: infoData.versionName || APP_VERSION,
        versionCode: infoData.versionCode || 0,
        device: infoData.device || 'Android',
        androidVersion: infoData.sdkInt || 0,
        bridge: infoData.bridgeVersion || 1
      };
    },

    capabilities() {
      const caps = call('capabilities', {});
      const data = caps.ok && caps.data ? caps.data : {};
      return {
        notifications: data.notifications !== false,
        nativeReminders: true,
        exactAlarms: !!data.exactAlarms,
        fileExport: true,
        fileImport: true,
        vibration: true
      };
    },

    notifyStatus() {
      const result = call('notifyStatus', {});
      return result.ok && result.data ? String(result.data.status || 'unknown') : 'unknown';
    },

    async requestNotifications() {
      const result = call('requestNotifications', {});
      if (!result.ok) return 'denied';
      if (result.data && result.data.status && result.data.status !== 'pending') return result.data.status;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          off();
          resolve('timeout');
        }, 60000);
        const off = on('notification-permission', (payload) => {
          clearTimeout(timer);
          off();
          resolve(payload && payload.granted ? 'granted' : 'denied');
        });
      });
    },

    async showNotification({ title, body, tag }) {
      const result = call('notifyNow', { title: String(title || ''), body: String(body || ''), tag: String(tag || '') });
      return !!(result.ok && result.data && result.data.shown);
    },

    /**
     * Hands the full reminder set to Kotlin, which mirrors it in SQLite and
     * (re)schedules AlarmManager alarms. Returns the number of scheduled alarms.
     */
    async syncReminders(reminders) {
      const result = call('syncReminders', { reminders: Array.isArray(reminders) ? reminders : [] });
      if (!result.ok) return { ok: false, scheduled: 0, error: result.error || 'sync failed' };
      return {
        ok: true,
        scheduled: Number(result.data && result.data.scheduled) || 0,
        exact: !!(result.data && result.data.exact)
      };
    },

    async cancelReminder(id) {
      const result = call('cancelReminder', { id: String(id || '') });
      return { ok: !!result.ok };
    },

    async firedHistory() {
      const result = call('history', {});
      if (!result.ok || !result.data || !Array.isArray(result.data.items)) return [];
      return result.data.items;
    },

    async clearHistory() {
      call('clearHistory', {});
    },

    async saveTextFile(filename, content) {
      const result = call('saveFile', { filename: String(filename || 'delies-backup.json'), content: String(content || '') });
      if (!result.ok) return { ok: false, error: result.error || 'save failed' };
      return { ok: true, method: 'android', path: result.data && result.data.path };
    },

    async shareText(text) {
      const result = call('shareText', { text: String(text || '') });
      return { ok: !!result.ok };
    },

    async setThemeMode(mode) {
      call('setTheme', { mode: String(mode || 'system') });
      return { ok: true };
    },

    async exactAlarmStatus() {
      const result = call('exactAlarmStatus', {});
      const data = result.ok && result.data ? result.data : {};
      return { supported: !!data.supported, allowed: !!data.allowed };
    },

    async requestExactAlarms() {
      const result = call('requestExactAlarms', {});
      return { ok: !!result.ok, unsupported: !!(result.data && result.data.unsupported) };
    },

    vibrate(ms = 30) {
      call('vibrate', { ms: Number(ms) || 30 });
    },

    onFired(handler) {
      return on('reminder-fired', handler);
    },

    onImport(handler) {
      return on('import-data', handler);
    },

    onPermissionChange(handler) {
      return on('notification-permission', handler);
    },

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

    /** Ask Android to move the app to background (web history cannot do this). */
    moveToBackground() {
      call('moveToBackground', {});
    },

    dispose() {
      backHandlers.clear();
      listeners.clear();
      pending.clear();
    }
  };
}
