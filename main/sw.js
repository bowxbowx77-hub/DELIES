/* DELIES service worker — offline caching of the local app shell.
 * Only same-origin GET requests are cached; the app makes no network requests
 * of its own, so this file never contacts third parties. */

const CACHE = 'delies-v2.0.0';
const ASSETS = [
  './',
  './index.html',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/views.css',
  './js/app.js',
  './js/core/dom.js',
  './js/core/icons.js',
  './js/core/i18n.js',
  './js/core/dates.js',
  './js/core/validate.js',
  './js/core/store.js',
  './js/core/backup.js',
  './js/core/reminders.js',
  './js/ui/overlay.js',
  './js/ui/controls.js',
  './js/ui/forms.js',
  './js/platform/index.js',
  './js/platform/web.js',
  './js/platform/native.js',
  './js/data/defaults.js',
  './js/data/locales/ru.js',
  './js/data/locales/uk.js',
  './js/data/locales/en.js',
  './js/views/home.js',
  './js/views/calendar.js',
  './js/views/tasks.js',
  './js/views/notes.js',
  './js/views/reminders.js',
  './js/views/shopping.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './js/views/shared.js',
  './assets/logo.svg',
  './assets/favicon.svg',
  './assets/icon-192.svg',
  './assets/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
