/**
 * Test harness: boots the real DELIES web app inside jsdom so the tests drive
 * the same DOM, the same router and the same store the browser uses.
 *
 * IndexedDB is intentionally unavailable here, which also exercises the
 * localStorage fallback path.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAIN = path.resolve(HERE, '../../main');

export const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class FakeNotification {
  static permission = 'granted';
  static instances = [];
  static reset(permission = 'granted') {
    FakeNotification.permission = permission;
    FakeNotification.instances = [];
  }
  static async requestPermission() {
    return FakeNotification.permission;
  }
  constructor(title, options) {
    this.title = title;
    this.options = options || {};
    FakeNotification.instances.push(this);
  }
}

function installMatchMedia(window) {
  const listeners = new Set();
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: (type, handler) => listeners.add(type + String(handler)),
    removeEventListener: () => listeners.clear(),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false
  });
}

export async function bootApp({ settings = {}, preload = {}, seedSettings = true } = {}) {
  const html = await readFile(path.join(MAIN, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost/main/index.html',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  const { window } = dom;
  installMatchMedia(window);

  // Seed persisted settings + data before the app boots.
  const rows = {};
  if (seedSettings) {
    rows.settings = [
      { id: 'app', theme: 'dark', lang: 'ru', notifications: true, weekStart: 1, userName: '', firstRunDone: true, ...settings }
    ];
  }
  Object.entries(preload).forEach(([type, items]) => {
    rows[type] = items;
  });
  Object.entries(rows).forEach(([type, items]) => {
    window.localStorage.setItem(`delies.v1.${type}`, JSON.stringify(items));
  });

  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
  globalThis.localStorage = window.localStorage;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.Event = window.Event;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.scrollTo = () => {};
  // Track every timer the app creates so close() can release them; otherwise
  // node's test runner would never exit because of the reminder scheduler.
  const timerIds = new Set();
  const realSetInterval = globalThis.setInterval;
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setInterval = (fn, ms, ...args) => {
    const id = realSetInterval(fn, ms, ...args);
    timerIds.add(id);
    return id;
  };
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = realSetTimeout(fn, ms, ...args);
    timerIds.add(id);
    return id;
  };
  window.scrollTo = () => {};
  globalThis.FakeNotification = FakeNotification;
  globalThis.Notification = FakeNotification;
  window.Notification = FakeNotification;
  globalThis.URL.createObjectURL = () => 'blob:delies-test';
  globalThis.URL.revokeObjectURL = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};

  const { boot } = await import(path.join(MAIN, 'js/app.js'));
  const ctx = await boot();
  await flushMicrotasks();
  return {
    dom,
    window,
    document: window.document,
    ctx,
    close() {
      try {
        ctx.reminders.stop();
      } catch {
        /* ignore */
      }
      try {
        if (ctx.currentView && typeof ctx.currentView.onDestroy === 'function') ctx.currentView.onDestroy();
      } catch {
        /* ignore */
      }
      timerIds.forEach((id) => {
        clearTimeout(id);
        clearInterval(id);
      });
      timerIds.clear();
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }
  };
}

export function qs(selector, root = document) {
  const found = root.querySelector(selector);
  if (!found) throw new Error(`Element not found: ${selector}`);
  return found;
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Navigates through the hash router (as the app itself does). */
export async function gotoHash(name, params) {
  const query = params
    ? Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')
    : '';
  window.location.hash = `#/${name}${query ? `?${query}` : ''}`;
  window.dispatchEvent(new window.Event('hashchange'));
  await flushMicrotasks();
  await flushMicrotasks();
}

export function navByLabel(label) {
  const item = qsa('.nav-bar__item').find((node) => node.getAttribute('aria-label') === label);
  if (!item) throw new Error(`Nav item not found: ${label}`);
  item.click();
  return item;
}

export function buttonByText(text, root = document) {
  const nodes = qsa('button', root);
  return nodes.find((node) => (node.textContent || '').trim() === text) || null;
}

export function setInputValue(input, value) {
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

export async function submitDialog(index = -1) {
  const actions = qsa('.dialog__actions .btn');
  const button = actions.at(index);
  if (!button) throw new Error('No dialog action button');
  button.click();
  await flushMicrotasks();
  await flushMicrotasks();
}
