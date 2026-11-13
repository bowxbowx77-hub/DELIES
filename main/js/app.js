/**
 * DELIES application shell: boot, routing, app bar, navigation bar, theme and
 * language handling, global error boundary and platform wiring.
 */

import { h, clear, debounce } from './core/dom.js';
import { iconNode } from './core/icons.js';
import { t, setLang, getLang, translateStatic } from './core/i18n.js';
import { openStore } from './core/store.js';
import { createPlatform } from './platform/index.js';
import { ReminderCenter } from './core/reminders.js';
import { sanitizeSettings, generateId } from './core/validate.js';
import { seedCategories, APP_VERSION } from './data/defaults.js';
import { showSnackbar, showDialog, showSheet, hasOpenOverlay, closeAllOverlays } from './ui/overlay.js';
import { iconButton } from './ui/controls.js';
import { openCategoryDialog } from './ui/forms.js';
import { todayKey } from './core/dates.js';

import homeView from './views/home.js';
import calendarView from './views/calendar.js';
import tasksView from './views/tasks.js';
import notesView from './views/notes.js';
import remindersView from './views/reminders.js';
import shoppingView from './views/shopping.js';
import statsView from './views/stats.js';
import settingsView from './views/settings.js';

const ROUTES = {
  home: { titleKey: 'nav.home', icon: 'home', module: homeView, nav: true },
  calendar: { titleKey: 'nav.calendar', icon: 'calendar', module: calendarView, nav: true },
  tasks: { titleKey: 'nav.tasks', icon: 'tasks', module: tasksView, nav: true },
  notes: { titleKey: 'nav.notes', icon: 'note', module: notesView, nav: true },
  reminders: { titleKey: 'nav.reminders', icon: 'bell', module: remindersView, nav: false },
  shopping: { titleKey: 'nav.shopping', icon: 'cart', module: shoppingView, nav: false },
  stats: { titleKey: 'nav.stats', icon: 'chart', module: statsView, nav: false },
  settings: { titleKey: 'nav.settings', icon: 'settings', module: settingsView, nav: false }
};

const NAV_ITEMS = ['home', 'calendar', 'tasks', 'notes'];

function detectLang(navigatorLang) {
  const raw = String(navigatorLang || 'ru').toLowerCase();
  if (raw.startsWith('uk')) return 'uk';
  if (raw.startsWith('en')) return 'en';
  return 'ru';
}

function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  try {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [name, queryString] = raw.split('?');
  const routeName = ROUTES[name] ? name : 'home';
  const params = {};
  if (queryString) {
    queryString.split('&').forEach((pair) => {
      const [key, value] = pair.split('=');
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
  }
  return { name: routeName, params };
}

export async function boot() {
  const root = document.getElementById('view');
  const appBarTitle = document.getElementById('appBarTitle');
  const appBarSubtitle = document.getElementById('appBarSubtitle');
  const appBarActions = document.getElementById('appBarActions');
  const appBarLeading = document.getElementById('appBarLeading');
  const navBar = document.getElementById('navBar');
  const fabHost = document.getElementById('fabHost');

  const platform = createPlatform({});

  const { store, warnings } = await openStore({});
  const ctx = {
    store,
    platform,
    appVersion: APP_VERSION,
    storageWarnings: warnings,
    viewState: {},
    currentView: null,
    settings: null,
    route: parseRoute(window.location.hash)
  };

  // --- settings -----------------------------------------------------------
  let settings = store.getSettings();
  if (!settings) {
    settings = sanitizeSettings({
      lang: detectLang(navigator.language),
      theme: 'system',
      notifications: true,
      weekStart: 1
    });
    settings = { ...settings, id: 'app' };
    await store.saveSettings(settings);
    const seeds = seedCategories(settings.lang).map((category) => ({
      id: generateId(),
      scope: category.scope,
      name: category.name,
      color: category.color
    }));
    seeds.forEach((category) => store.put('categories', category));
    await store.flush();
  }
  ctx.settings = settings;

  function applyTheme(mode) {
    const resolved = resolveTheme(mode);
    document.documentElement.setAttribute('data-theme', resolved);
    try {
      localStorage.setItem('delies.themeHint', resolved);
    } catch {
      /* storage may be blocked */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'light' ? '#f7f4fb' : '#121016');
    if (platform.setThemeMode) platform.setThemeMode(resolved);
  }

  applyTheme(settings.theme);
  setLang(settings.lang);
  document.documentElement.lang = settings.lang;

  // --- helpers exposed to views ------------------------------------------
  ctx.t = t;
  ctx.getLang = getLang;
  ctx.categoriesFor = (scope) =>
    store
      .find('categories', (category) => category.scope === scope)
      .sort((a, b) => a.name.localeCompare(b.name));
  ctx.categoryById = (id) => (id ? store.get('categories', id) : null);
  ctx.toast = (message, options) => showSnackbar(message, options || {});
  ctx.navigate = (name, params) => {
    const query = params
      ? Object.keys(params)
          .filter((key) => params[key] !== undefined && params[key] !== '')
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
          .join('&')
      : '';
    window.location.hash = `#/${name}${query ? `?${query}` : ''}`;
  };
  ctx.afterChange = (type) => {
    store.flush().catch((error) => ctx.reportError(error));
    if (type === 'reminders' || type === 'tasks' || type === 'events') reminders.tick();
    refresh({ silent: true });
  };
  ctx.reportError = (error, message) => {
    // eslint-disable-next-line no-console
    console.error('[DELIES]', error);
    showSnackbar(message || t('errors.generic'), { error: true });
  };
  ctx.confirm = (options) =>
    showDialog({
      title: options.title,
      text: options.text,
      icon: options.icon || 'alert',
      actions: [
        { label: options.cancelLabel || t('common.cancel'), variant: 'text', value: false },
        { label: options.confirmLabel || t('common.confirm'), variant: options.danger === false ? 'filled' : 'danger', value: true }
      ]
    }).promise.then((result) => result === true);
  ctx.updateSettings = async (patch) => {
    const next = sanitizeSettings({ ...ctx.settings, ...patch });
    if (patch.firstRunDone === undefined) next.firstRunDone = ctx.settings.firstRunDone;
    ctx.settings = next;
    await store.saveSettings(next);
    if (patch.theme !== undefined) applyTheme(next.theme);
    if (patch.lang !== undefined) {
      setLang(next.lang);
      translateStatic(document);
      renderChrome();
    }
    refresh();
  };
  ctx.openCategories = () => {
    const content = h('div.stack');
    const list = h('div.list');
    function renderList() {
      clear(list);
      const categories = store.all('categories').sort((a, b) => a.name.localeCompare(b.name));
      if (!categories.length) list.appendChild(h('p.small.muted', { text: t('category.empty'), style: { padding: '12px' } }));
      categories.forEach((category) => {
        list.appendChild(
          h(
            'div.list-item',
            null,
            h('span.chip__dot', { style: { background: `var(--label-${category.color})` } }),
            h(
              'div.list-item__content',
              null,
              h('div.list-item__headline', { text: category.name }),
              h('div.list-item__supporting', { text: t(`category.scope${category.scope[0].toUpperCase()}${category.scope.slice(1)}`) })
            ),
            h(
              'div.list-item__trailing',
              null,
              iconButton('edit', t('common.edit'), () =>
                openCategoryDialog(ctx, { category }), { small: true }),
              iconButton(
                'trash',
                t('common.delete'),
                async () => {
                  const ok = await ctx.confirm({
                    title: t('common.delete'),
                    text: t('category.deleteConfirm', { name: category.name })
                  });
                  if (!ok) return;
                  store.remove('categories', category.id);
                  ctx.afterChange('categories');
                  renderList();
                },
                { small: true }
              )
            )
          )
        );
      });
    }
    renderList();
    content.appendChild(list);
    content.appendChild(
      h(
        'button.btn.btn--tonal.btn--block',
        {
          type: 'button',
          style: { marginTop: '12px' },
          on: {
            click: () => {
              openCategoryDialog(ctx, { scope: 'task' });
            }
          }
        },
        t('category.new')
      )
    );
    showSheet({ title: t('category.title'), content });
  };

  // --- reminders ---------------------------------------------------------
  const reminders = new ReminderCenter({
    store,
    platform,
    onChange: () => refresh({ silent: true }),
    onFired: (reminder) => {
      if (reminder) showSnackbar(t('toast.fired', { title: reminder.title }), { action: t('nav.reminders'), onAction: () => ctx.navigate('reminders') });
    },
    onError: (error) => ctx.reportError(error, t('errors.generic'))
  });
  ctx.reminders = reminders;
  reminders.start();

  // --- storage errors ----------------------------------------------------
  store.onError((error) => {
    showSnackbar(t('errors.storage'), { error: true });
    // eslint-disable-next-line no-console
    console.error('[DELIES] storage error', error);
  });

  // --- routing -----------------------------------------------------------
  let renderingKey = '';
  function currentRoute() {
    return parseRoute(window.location.hash);
  }

  function renderChrome() {
    const route = ctx.route;
    const config = ROUTES[route.name];
    clear(appBarLeading);
    clear(appBarActions);
    clear(navBar);

    if (route.name === 'home') {
      appBarLeading.appendChild(h('div', { style: { width: '8px' } }));
    } else {
      appBarLeading.appendChild(iconButton('arrowLeft', t('common.back') || 'Назад', () => window.history.back(), { small: true }));
    }

    appBarTitle.textContent = t(config.titleKey);
    appBarSubtitle.textContent = '';
    appBarSubtitle.hidden = true;

    (ctx.currentView && ctx.currentView.appBarActions ? ctx.currentView.appBarActions() : []).forEach((node) => {
      if (node) appBarActions.appendChild(node);
    });

    const spacer = h('div', { style: { width: '4px' } });
    appBarActions.appendChild(spacer);
    appBarActions.appendChild(
      iconButton('more', t('nav.moreTitle'), () => openMoreSheet(), { small: true })
    );

    NAV_ITEMS.forEach((name) => {
      const item = ROUTES[name];
      navBar.appendChild(
        h(
          'button.nav-bar__item',
          {
            type: 'button',
            'aria-current': route.name === name ? 'page' : 'false',
            'aria-label': t(item.titleKey),
            on: { click: () => ctx.navigate(name) }
          },
          h('span.nav-bar__indicator', null, iconNode(item.icon)),
          h('span.nav-bar__label', { text: t(item.titleKey) }),
          name === 'tasks' ? taskBadge() : null
        )
      );
    });
    navBar.appendChild(
      h(
        'button.nav-bar__item',
        {
          type: 'button',
          'aria-current': ROUTES[route.name].nav ? 'false' : 'page',
          'aria-label': t('nav.more'),
          on: { click: () => openMoreSheet() }
        },
        h('span.nav-bar__indicator', null, iconNode('more')),
        h('span.nav-bar__label', { text: t('nav.more') })
      )
    );
  }

  function taskBadge() {
    const overdue = store.count('tasks', (task) => !task.done && task.due && task.due < todayKey());
    if (!overdue) return null;
    return h('span.nav-bar__badge', { text: String(overdue), 'aria-label': `${t('tasks.overdue')}: ${overdue}` });
  }

  function openMoreSheet() {
    const items = ['reminders', 'shopping', 'stats', 'settings'];
    const content = h('div.list.list--flat');
    items.forEach((name) => {
      const config = ROUTES[name];
      const counts = name === 'reminders' ? store.count('reminders', (r) => r.enabled) : 0;
      content.appendChild(
        h(
          'button.list-item',
          {
            type: 'button',
            on: {
              click: () => {
                sheet.close();
                ctx.navigate(name);
              }
            }
          },
          h('span.list-item__leading', null, iconNode(config.icon)),
          h('div.list-item__content', null, h('div.list-item__headline', { text: t(config.titleKey) })),
          h('div.list-item__trailing', null, counts ? h('span.badge', { text: String(counts) }) : null, iconNode('chevronRight'))
        )
      );
    });
    const sheet = showSheet({ title: t('nav.moreTitle'), content });
  }

  function render({ silent = false } = {}) {
    const route = currentRoute();
    const key = `${route.name}:${JSON.stringify(route.params)}`;
    const changed = key !== renderingKey;
    ctx.route = route;
    const config = ROUTES[route.name];

    if (changed || !ctx.currentView) {
      if (ctx.currentView && typeof ctx.currentView.onDestroy === 'function') {
        try {
          ctx.currentView.onDestroy();
        } catch (error) {
          ctx.reportError(error);
        }
      }
      clear(root);
      let view;
      try {
        view = config.module(ctx);
      } catch (error) {
        ctx.reportError(error, t('errors.generic'));
        view = {
          render: () => h('div.empty-state', null, h('p', { text: t('errors.generic') })),
          appBarActions: () => []
        };
      }
      ctx.currentView = view;
      renderingKey = key;
      root.appendChild(view.render());
      root.classList.remove('view-enter');
      // Re-trigger the enter animation without layout thrash.
      void root.offsetWidth;
      root.classList.add('view-enter');
      if (typeof view.onMount === 'function') {
        try {
          view.onMount();
        } catch (error) {
          ctx.reportError(error);
        }
      }
      updateFab(view);
      renderChrome();
      if (typeof view.afterChrome === 'function') view.afterChrome();
    } else if (ctx.currentView) {
      // Same route: prefer an in-place update (keeps focus in search fields),
      // otherwise re-render the whole view.
      if (typeof ctx.currentView.update === 'function' && ctx.currentView.update() === true) {
        updateFab(ctx.currentView);
        renderChrome();
        return;
      }
      const scroll = window.scrollY;
      clear(root);
      root.appendChild(ctx.currentView.render());
      updateFab(ctx.currentView);
      renderChrome();
      window.scrollTo(0, scroll);
    }
  }

  function updateFab(view) {
    clear(fabHost);
    if (!view || typeof view.fab !== 'function') return;
    const fab = view.fab();
    if (!fab) return;
    fabHost.appendChild(
      h(
        'button.fab',
        {
          type: 'button',
          'aria-label': fab.label,
          title: fab.label,
          on: { click: fab.onClick }
        },
        iconNode(fab.icon || 'plus'),
        h('span', { text: fab.label })
      )
    );
  }

  function refresh(options) {
    render(options || {});
  }
  ctx.refresh = refresh;

  const onStoreChange = debounce(() => refresh({ silent: false, fromStore: true }), 40);
  store.subscribe(() => onStoreChange());

  // --- navigation events -------------------------------------------------
  window.addEventListener('hashchange', () => {
    try {
      render();
      window.scrollTo(0, 0);
    } catch (error) {
      // The window can be torn down (WebView/close) between events.
      // eslint-disable-next-line no-console
      console.error('[DELIES] navigation failed', error);
    }
  });

  // --- hardware back (Android) / browser back ----------------------------
  platform.attachBackHandler(() => {
    if (hasOpenOverlay()) {
      closeAllOverlays();
      return true;
    }
    const route = currentRoute();
    if (route.name !== 'home') return false; // let the WebView history handle it
    return false;
  });

  // --- native events -----------------------------------------------------
  if (platform.onImport) {
    platform.onImport(async (payload) => {
      if (!payload || typeof payload.text !== 'string') return;
      const { applyImport } = await import('./views/settings.js');
      await applyImport(ctx, payload.text);
    });
  }
  if (platform.onPermissionChange) {
    platform.onPermissionChange(() => refresh({ silent: true }));
  }
  if (platform.isNative) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reminders.pullNativeHistory();
    });
  }

  // --- global error boundary --------------------------------------------
  window.addEventListener('error', (event) => {
    if (event && event.message) {
      // eslint-disable-next-line no-console
      console.error('[DELIES] unhandled error', event.message);
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    // eslint-disable-next-line no-console
    console.error('[DELIES] unhandled rejection', event.reason);
  });

  // --- first run ---------------------------------------------------------
  render();
  if (!ctx.settings.firstRunDone) {
    showWelcome(ctx);
  }
  if (warnings.length) {
    // eslint-disable-next-line no-console
    console.warn('[DELIES] storage warnings', warnings);
  }

  // --- service worker (offline shell for http(s) deployments) -----------
  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline caching is optional; the app works without it */
    });
  }

  return ctx;
}

function showWelcome(ctx) {
  const name = h('input.field__control', { type: 'text', placeholder: t('settings.name'), maxlength: '40' });
  name.style.padding = '0 16px';
  const content = h(
    'div.stack',
    null,
    h('p.card__body', { text: t('settings.privacy') }),
    h('label.field', null, h('span.field__label', { text: t('settings.name') }), name),
    h('p.small.muted', { text: `DELIES ${APP_VERSION}` })
  );
  showDialog({
    title: 'DELIES',
    text: t('app.tagline'),
    icon: 'target',
    content,
    actions: [
      { label: t('common.ok'), variant: 'filled' }
    ],
    onClose: async () => {
      const value = String(name.value || '').trim().slice(0, 40);
      await ctx.updateSettings({ userName: value, firstRunDone: true });
    }
  });
}
