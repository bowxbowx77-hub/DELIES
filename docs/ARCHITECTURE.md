# DELIES — архитектура

Документ описывает, как устроены обе версии продукта, какие решения приняты и
почему. Цель архитектуры — **один интерфейс и одна логика** на веб и Android,
с тонким платформенным слоем для нативных возможностей.

```
                     ┌──────────────────────────────────────────┐
                     │        main/  (HTML + CSS + JS)          │
                     │  views → ui → core (store, dates, …)     │
                     │              │                            │
                     │     platform/index.js (адаптер)           │
                     └───────┬────────────────────┬─────────────┘
                             │                    │
                 platform/web.js        platform/native.js
                             │                    │
                   Notification API      window.DELIESNative.call()
                   Blob download                │
                   history back          ┌──────┴───────────────┐
                                         │  DeliesBridge.kt     │
                                         │  (белый список)      │
                                         └──────┬───────────────┘
                                                │
                        ┌───────────────────────┼──────────────────────┐
                        │                       │                      │
             ReminderRepository          ReminderScheduler     NotificationHelper
                (SQLite)                  (AlarmManager)       (NotificationManager)
                        │                       │
                  BootReceiver            ReminderReceiver
                                          ReminderActionReceiver
```

## 1. Слои веб-приложения

| Слой | Файлы | Ответственность |
| --- | --- | --- |
| Оболочка | `js/app.js` | загрузка, роутер (hash), app bar, Navigation Bar, тема, язык, глобальная обработка ошибок |
| Экраны | `js/views/*.js` | разметка и поведение разделов; обновление через `update()` |
| UI-компоненты | `js/ui/*.js` | оверлеи (диалог, bottom sheet, snackbar), поля, чипы, формы сущностей |
| Ядро | `js/core/*.js` | хранилище, даты и повторения, валидация, резервные копии, движок напоминаний, i18n, DOM-хелперы |
| Данные | `js/data/*` | локализации, начальные категории, константы |
| Платформа | `js/platform/*` | выбор и реализация адаптера (браузер или Android) |

### Контракт экрана

```js
export default function view(ctx) {
  return {
    render() -> HTMLElement,
    update?() -> true,            // частичное обновление без потери фокуса
    onMount?(), onDestroy?(),
    appBarActions?() -> [Node],
    fab?() -> { icon, label, onClick }
  };
}
```

`ctx` — единственная точка доступа к приложению: `store`, `platform`, `settings`,
`toast`, `confirm`, `navigate`, `updateSettings`, `categoriesFor`, `reminders`,
`afterChange(type)`, `refresh()`.

## 2. Модель данных

Хранилища (object stores в IndexedDB, либо ключи `delies.v1.<type>` в localStorage):

| Коллекция | Сущность |
| --- | --- |
| `tasks` | `{id, title, notes, done, priority, due, dueTime, categoryId, subtasks[], createdAt, updatedAt, completedAt}` |
| `events` | `{id, title, notes, start, startTime, endTime, allDay, categoryId, recurrence}` |
| `reminders` | `{id, title, notes, at, recurrence, categoryId, enabled, lastFiredAt}` |
| `notes` | `{id, title, body, pinned, categoryId, color, createdAt, updatedAt}` |
| `lists` / `listItems` | `{id, title, categoryId}` / `{id, listId, title, qty, unit, done}` |
| `categories` | `{id, scope, name, color}` |
| `history` | `{id, reminderId, title, firedAt, action}` |
| `settings` | единственный документ `{id:'app', theme, lang, notifications, weekStart, userName, firstRunDone}` |

Повторения (`recurrence`): `{freq: none|daily|weekly|monthly|yearly, interval, until}`.

Все записи проходят через `js/core/validate.js` **и при записи, и при чтении**,
поэтому повреждённое хранилище или чужой файл импорта не может привести к
неожиданной структуре в рендере.

## 3. Хранилище

`js/core/store.js` реализует три адаптера с общим асинхронным интерфейсом:

1. `IndexedDbAdapter` — основное хранилище (транзакции, большие объёмы, устойчивость).
2. `LocalStorageAdapter` — резерв (приватный режим, ограничения WebView/`file://`).
3. `MemoryAdapter` — последний рубеж; интерфейс явно предупреждает, что данные не сохранятся.

Модель работы: **in-memory кэш = источник истины для рендера** (синхронные чтения),
запись проходит через адаптер с дебаунсом и повторной попыткой при ошибке
(`store.markDirty` / `flush`). Ошибки хранения всплывают в интерфейс, а не теряются.

Выбор адаптера не скрыт от пользователя: тип хранилища показан в «Настройки → О приложении».

## 4. Платформенный адаптер

Интерфейс (реализуется в `js/platform/web.js` и `js/platform/native.js`):

```js
platform.isNative                 boolean
platform.appInfo()                { platform, appVersion, device, bridge }
platform.capabilities()           { notifications, nativeReminders, exactAlarms, … }
platform.notifyStatus()           'granted' | 'denied' | 'default' | 'unsupported'
platform.requestNotifications()   -> status
platform.showNotification(a)      -> boolean
platform.syncReminders(list)      -> { ok, scheduled, exact }     // Android: реальные будильники
platform.cancelReminder(id)
platform.firedHistory()           -> [{ reminderId, title, firedAt, action }]
platform.saveTextFile(name, text) -> { ok, path? }                 // web: скачивание; Android: SAF/share
platform.setThemeMode(mode)                                        // Android: ночной режим + статус-бар
platform.vibrate(ms)
platform.attachBackHandler(fn)    // «Назад» в Android / history в браузере
platform.onFired(cb), onImport(cb), onPermissionChange(cb)
```

Правило проекта: **если функция платформозависима, она существует только в адаптере**.
Вью-код не знает, браузер это или APK; он вызывает адаптер. Поэтому кнопка не может
«работать в HTML и не работать в APK» — обе реализации покрыты одним и тем же UI.

Различия, которые честно показываются в интерфейсе:

| Возможность | Веб | Android |
| --- | --- | --- |
| Напоминания | пока вкладка открыта (Notification API) | AlarmManager + системные уведомления, работают всегда |
| История срабатываний | в IndexedDB | в SQLite + импорт в IndexedDB |
| Экспорт файла | скачивание через Blob | запись в каталог приложения + системный «Поделиться» |
| Тема | `data-theme` + `prefers-color-scheme` | то же + `AppCompatDelegate` (статус-бар, ночной режим) |

## 5. Движок напоминаний

```
reminder (at, recurrence)
        │
        ├── web:    ReminderCenter.tick() каждые 30 c + visibilitychange
        │           → Notification API → history + lastFiredAt
        │
        └── android: ReminderCenter.pushToNative() → bridge.syncReminders()
                    → SQLite-зеркало → AlarmManager (ровно один будильник на напоминание)
                    → ReminderReceiver → NotificationManager → history в SQLite
                    → следующий повтор планируется сразу после показа
                    → BootReceiver восстанавливает всё после перезагрузки
```

Алгоритм повторений дублируется на JS (`shiftOccurrence`/`nextOccurrence`) и Kotlin
(`RecurrenceCalculator`), потому что нативная сторона обязана планировать будильники
без запущенного WebView. Обе реализации:

- вычисляют каждое срабатывание сдвигом **базовой** даты (нет «дрейфа» 31 января → 28 февраля → 28 марта);
- трактуют `until` включительно до конца дня;
- не возвращают «следующее» для разового напоминания в прошлом.

Одинаковость закреплена тестами с двух сторон (JS: `tests/web/unit.test.mjs`,
Kotlin: `RecurrenceCalculatorTest`): одни и те же даты и интервалы.

## 6. Мост JS ↔ Kotlin

Один объект, один метод, белый список операций:

```js
DELIESNative.call('syncReminders', JSON.stringify({ reminders: [...] }))
// → '{"ok":true,"data":{"scheduled":3,"exact":true,"stored":3}}'
```

События Kotlin → JS: `window.DELIESBridge.emit('reminder-fired', '{"reminderId":…}')`.

Защита:

- вызов отклоняется, если URL страницы не `https://appassets.androidplatform.net`
  (то есть если WebView когда-либо загрузит чужой контент, мост перестанет отвечать);
- неизвестные методы → `{"ok":false}`;
- payload ≤ 512 КБ, резервная копия ≤ 4 МБ;
- вся входящая структура валидируется (`Reminders.sanitize`), идентификаторы
  проверяются по `^[A-Za-z0-9_-]{1,64}$`, даты — через `java.time`;
- на страницу не добавляется никаких других интерфейсов; `file://` и доступ к
  файлам отключены.

## 7. Безопасность и приватность

- Нет `eval`, `new Function`, обработки пользовательского HTML: только `textContent`
  и `setAttribute`. `innerHTML` допускается лишь для статических SVG-иконок из
  собственного реестра (проверяется тестом).
- Нет сетевых запросов: приложение не использует `fetch`/XHR/WebSocket, не подключает
  CDN, шрифты или аналитику. В Android-манифесте нет разрешения `INTERNET`.
- Ввод ограничивается по длине и очищается от управляющих символов; импорт проверяет
  `app`, версию схемы и каждую сущность.
- Секреты в исходниках отсутствуют (проверяется тестом).
- Тема и язык применяются без «вспышки»: тема читается из `localStorage` до первой
  отрисовки, остальные настройки — из хранилища при старте.

## 8. Сборка и доставка

```
main/  ──(Copy task)──►  android/app/build/generated/webassets/www  ──►  APK assets
main/  ──(static)────►  любой HTTP-сервер (веб-версия)
```

GitHub Actions: job `web-tests` (npm ci + 35 тестов) → job `android`
(JDK 17, Android SDK 34, unit-тесты, lint, `assembleDebug`, проверка APK,
артефакт `DELIES-Android-APK`). Релизы автоматически не публикуются.

## 9. Осознанные ограничения

- Нет облачной синхронизации между устройствами: серверной части нет, и это
  заявлено в интерфейсе. Перенос данных — через экспорт/импорт JSON.
- Веб-версия не может будить устройство в фоне (ограничение браузеров) — в Android
  эта задача решается системными API.
- Повторения не поддерживают исключения отдельных дат и «последний день месяца»
  как отдельное правило: только интервал и дата окончания.
