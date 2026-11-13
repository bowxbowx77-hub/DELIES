# DELIES — Android-приложение (Kotlin)

Нативное Android-приложение, которое запускает встроенную веб-версию DELIES из
`../main` в защищённом WebView и добавляет системные возможности: уведомления,
планирование будильников, восстановление после перезагрузки, экспорт файлов,
синхронизацию темы.

**Важно:** HTML-исходники не дублируются. Сборка копирует `../main` в assets
(`app/build/generated/webassets/www`), поэтому веб-версия и APK всегда содержат
один и тот же интерфейс и одну и ту же логику.

## Требования

| Компонент | Версия |
| --- | --- |
| JDK | 17 |
| Android SDK Platform | 34 |
| Build-Tools | 34.0.0 |
| Gradle | 8.9 (через wrapper) |
| AGP / Kotlin | 8.5.2 / 1.9.24 |
| minSdk | 26 (Android 8.0) |
| targetSdk / compileSdk | 34 |

## Сборка

```bash
cd android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Юнит-тесты (JVM, без устройства):

```bash
cd android
./gradlew testDebugUnitTest
# отчёт: app/build/reports/tests/testDebugUnitTest/index.html
```

Установка на устройство/эмулятор:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Или соберите APK в GitHub Actions (workflow `Android build`, артефакт
`DELIES-Android-APK`) и установите файл вручную: «Настройки → Приложения →
Установка из неизвестных источников» → разрешить для файлового менеджера/браузера
→ открыть APK. Подпись — стандартный debug-ключ CI, поэтому Play Protect может
попросить подтверждение («Установить всё равно»).

## Структура проекта

```
android/
├── settings.gradle.kts           # модули и репозитории
├── build.gradle.kts              # версии плагинов
├── gradle.properties
├── gradle/wrapper/               # Gradle 8.9 wrapper (jar + properties)
├── gradlew, gradlew.bat
└── app/
    ├── build.gradle.kts          # конфигурация модуля + копирование ../main в assets
    ├── proguard-rules.pro
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   ├── java/com/delies/app/
        │   │   ├── MainActivity.kt          # WebView, AssetLoader, «Назад», тема, ошибки
        │   │   ├── DeliesBridge.kt          # единственная точка JS ↔ Kotlin
        │   │   ├── DeliesApplication.kt     # каналы уведомлений, тема
        │   │   ├── Reminder.kt              # модели + валидация
        │   │   ├── RecurrenceCalculator.kt  # повторения (java.time, без Android API)
        │   │   ├── ReminderRepository.kt    # SQLite-зеркало напоминаний и история
        │   │   ├── ReminderScheduler.kt     # AlarmManager (точные/неточные будильники)
        │   │   ├── ReminderReceiver.kt      # показ уведомления, следующее срабатывание
        │   │   ├── ReminderActionReceiver.kt# действия «Отложить»/«Готово»
        │   │   ├── BootReceiver.kt          # восстановление после перезагрузки
        │   │   └── NotificationHelper.kt    # каналы и NotificationManager
        │   └── res/                         # layout, темы M3 (день/ночь), иконки, xml-правила
        └── test/java/com/delies/app/        # JVM-тесты повторений и валидации
```

## Как устроен WebView

- Контент отдаётся через `WebViewAssetLoader` с домена
  `https://appassets.androidplatform.net` — это настоящий **secure origin**, поэтому
  работают IndexedDB, `crypto.randomUUID`, `Intl` и прочие API так же, как в браузере
  (у `file://` они ограничены).
- `allowFileAccess = false`, `allowContentAccess = false`,
  `mixedContentMode = NEVER_ALLOW`, переходы за пределы origin блокируются.
- Пользовательские данные не покидают устройство: приложение даже не запрашивает
  разрешение `INTERNET`.
- Ошибка загрузки главного фрейма показывает нативный экран с кнопкой «Повторить».
- Кнопка «Назад» сначала отдаётся веб-слою (`window.DELIESBridge.handleBack()`),
  который закрывает диалоги/листы и возвращается по истории; если он не обработал
  событие — работает история WebView, затем приложение уходит в фон.

## Мост JavaScript ↔ Kotlin

На страницу добавляется ровно один объект — `DELIESNative` с единственным методом:

```js
DELIESNative.call(method, payloadJson) -> '{"ok":true,"data":{...}}'
```

| Метод | Назначение |
| --- | --- |
| `info` | версия приложения, версия Android, модель устройства |
| `capabilities` | поддержка уведомлений, точных будильников, вибрации |
| `notifyStatus` / `requestNotifications` | состояние и запрос `POST_NOTIFICATIONS` |
| `notifyNow` | немедленное тестовое уведомление |
| `syncReminders` | зеркалирование напоминаний в SQLite + планирование будильников |
| `cancelReminder` | отмена будильника и уведомления |
| `history` / `clearHistory` | история срабатываний из нативной БД |
| `saveFile` | запись резервной копии и системный «Поделиться» |
| `shareText` | системный share произвольного текста |
| `setTheme` | синхронизация темы с нативной темой (статус-бар, ночной режим) |
| `exactAlarmStatus` / `requestExactAlarms` | разрешение точных будильников (Android 12+) |
| `vibrate`, `moveToBackground`, `log` | тактильный отклик, фон, диагностика |

События из Kotlin в JS: `window.DELIESBridge.emit(event, payloadJson)` —
`reminder-fired`, `notification-permission`, `import-data`.

**Защита моста:** вызов отклоняется, если загруженный URL не принадлежит
`https://appassets.androidplatform.net`; метод должен входить в белый список;
размер payload ограничен 512 КБ; весь ввод валидируется (id, даты, частоты
повторения, длина строк).

## Разрешения

| Разрешение | Зачем | Поведение без него |
| --- | --- | --- |
| `POST_NOTIFICATIONS` (Android 13+) | показ напоминаний | приложение работает, напоминания не показываются; есть кнопка запроса |
| `SCHEDULE_EXACT_ALARM` (Android 12+) | точное время | напоминания планируются неточно (`setAndAllowWhileIdle`), в настройках показано предупреждение со ссылкой на системный экран |
| `RECEIVE_BOOT_COMPLETED` | восстановление будильников | после перезагрузки напоминания не восстанавливаются автоматически |
| `VIBRATE` | тактильный отклик | без вибрации |

## Совместимость

- Android 8.0 (API 26) и выше: используется `java.time` (API 26+), адаптивные иконки,
  векторные drawable.
- Android 12/12L (API 31/32): учтены `PendingIntent.FLAG_IMMUTABLE`, ограничения
  точных будильников и `android:exported` у компонентов.
- Android 13+ (API 33): запрос `POST_NOTIFICATIONS` во время работы.
- Android 14 (API 34): `compileSdk`/`targetSdk` 34, `dataExtractionRules`.

## Ограничения

- Инструментальные (instrumented) тесты в этом окружении не запускались — эмулятор
  недоступен. Юнит-тесты JVM выполняются в CI и описаны в `../docs/TESTING.md`.
- Сборка APK выполняется автоматически в GitHub Actions; готовый файл прилагается
  к запуску workflow как артефакт.
