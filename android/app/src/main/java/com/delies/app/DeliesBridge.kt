package com.delies.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Vibrator
import android.provider.Settings
import android.util.Log
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File

/**
 * The only JavaScript ↔ Kotlin entry point.
 *
 * Security notes:
 *  - a single allow-listed `call` method is exposed (no API surface browsing);
 *  - every call is rejected unless the loaded page is the bundled app origin;
 *  - payloads are size-limited and parsed defensively;
 *  - the bridge never returns raw exceptions or filesystem paths of user data.
 */
class DeliesBridge(
    private val activity: MainActivity,
    private val currentUrl: () -> String?
) {

    @JavascriptInterface
    fun call(method: String, payloadJson: String?): String {
        return try {
            val url = currentUrl()
            if (url == null || !url.startsWith(MainActivity.APP_ORIGIN)) {
                return error("forbidden origin")
            }
            if (method.length > 64) return error("bad method")
            val raw = payloadJson ?: "{}"
            if (raw.length > MAX_PAYLOAD_BYTES) return error("payload too large")

            when (method) {
                "info" -> info()
                "capabilities" -> capabilities()
                "notifyStatus" -> ok(JSONObject().put("status", notificationStatus()))
                "requestNotifications" -> requestNotifications()
                "notifyNow" -> notifyNow(raw)
                "syncReminders" -> syncReminders(raw)
                "cancelReminder" -> cancelReminder(raw)
                "history" -> history()
                "clearHistory" -> clearHistory()
                "saveFile" -> saveFile(raw)
                "shareText" -> shareText(raw)
                "setTheme" -> setTheme(raw)
                "exactAlarmStatus" -> exactAlarmStatus()
                "requestExactAlarms" -> requestExactAlarms()
                "vibrate" -> vibrate(raw)
                "moveToBackground" -> moveToBackground()
                "log" -> logFromWeb(raw)
                else -> error("unknown method")
            }
        } catch (failure: Exception) {
            Log.e(TAG, "Bridge call failed: $method", failure)
            error(failure.message ?: "bridge failure")
        }
    }

    // --- read-only info ----------------------------------------------------

    private fun info(): String {
        val data = JSONObject()
            .put("versionName", BuildConfig.VERSION_NAME)
            .put("versionCode", BuildConfig.VERSION_CODE)
            .put("sdkInt", Build.VERSION.SDK_INT)
            .put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("bridgeVersion", BRIDGE_VERSION)
        return ok(data)
    }

    private fun capabilities(): String {
        val data = JSONObject()
            .put("notifications", true)
            .put("exactAlarms", ReminderScheduler(activity).canScheduleExact())
            .put("vibration", activity.getSystemService(Vibrator::class.java) != null)
        return ok(data)
    }

    private fun notificationStatus(): String = when {
        !hasNotificationApi() -> "unsupported"
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED -> "default"
        !NotificationHelper.permissionGranted(activity) -> "denied"
        else -> "granted"
    }

    private fun hasNotificationApi(): Boolean = true

    // --- notifications -----------------------------------------------------

    private fun requestNotifications(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Before Android 13 the permission is implicit; the user may still
            // have disabled notifications in system settings.
            val granted = NotificationHelper.permissionGranted(activity)
            emitLater("notification-permission", JSONObject().put("granted", granted))
            return ok(JSONObject().put("status", if (granted) "granted" else "denied"))
        }
        activity.runOnUiThread { activity.requestNotificationPermission() }
        return ok(JSONObject().put("status", "pending"))
    }

    private fun notifyNow(raw: String): String {
        val payload = JSONObject(raw)
        val title = payload.optString("title", activity.getString(R.string.app_name)).take(Reminders.MAX_TITLE)
        val body = payload.optString("body", "").take(Reminders.MAX_NOTES)
        val reminder = Reminder(id = "test", title = title, notes = body, at = "", enabled = true)
        NotificationHelper.showReminder(activity, reminder)
        return ok(JSONObject().put("shown", NotificationHelper.permissionGranted(activity)))
    }

    // --- reminders ---------------------------------------------------------

    private fun syncReminders(raw: String): String {
        val reminders = Reminders.parseList(raw)
        val repository = ReminderRepository.get(activity)
        repository.replaceAll(reminders)
        val scheduler = ReminderScheduler(activity)
        val scheduled = scheduler.scheduleAll(reminders)
        return ok(
            JSONObject()
                .put("scheduled", scheduled)
                .put("exact", scheduler.canScheduleExact())
                .put("stored", reminders.size)
        )
    }

    private fun cancelReminder(raw: String): String {
        val id = JSONObject(raw).optString("id", "").trim()
        if (id.isEmpty() || id.length > 64) return error("bad id")
        ReminderRepository.get(activity).delete(id)
        ReminderScheduler(activity).cancel(id)
        return ok()
    }

    private fun history(): String {
        val items = ReminderRepository.get(activity).history(200)
        val array = org.json.JSONArray()
        items.forEach { item ->
            array.put(
                JSONObject()
                    .put("id", item.id)
                    .put("reminderId", item.reminderId)
                    .put("title", item.title)
                    .put("firedAt", item.firedAt)
                    .put("action", item.action)
            )
        }
        return ok(JSONObject().put("items", array))
    }

    private fun clearHistory(): String {
        ReminderRepository.get(activity).clearHistory()
        return ok()
    }

    // --- files -------------------------------------------------------------

    private fun saveFile(raw: String): String {
        val payload = JSONObject(raw)
        val filename = sanitizeFileName(payload.optString("filename", "delies-backup.json"))
        val content = payload.optString("content", "")
        if (content.isEmpty() || content.length > MAX_BACKUP_CHARS) return error("bad backup content")

        val directory = File(activity.filesDir, "backups")
        if (!directory.exists() && !directory.mkdirs()) return error("cannot create backup folder")
        val file = File(directory, filename)
        file.writeText(content, Charsets.UTF_8)

        val uri: Uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
        activity.runOnUiThread {
            val share = Intent(Intent.ACTION_SEND).apply {
                type = "application/json"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_SUBJECT, activity.getString(R.string.share_backup_title))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(Intent.createChooser(share, activity.getString(R.string.share_backup_title)))
        }
        return ok(JSONObject().put("path", file.name).put("shared", true))
    }

    private fun shareText(raw: String): String {
        val text = JSONObject(raw).optString("text", "").take(MAX_BACKUP_CHARS)
        if (text.isEmpty()) return error("empty text")
        activity.runOnUiThread {
            val share = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }
            activity.startActivity(Intent.createChooser(share, activity.getString(R.string.share_backup_title)))
        }
        return ok()
    }

    private fun sanitizeFileName(value: String): String {
        val cleaned = value.replace(Regex("[^A-Za-z0-9._-]"), "_").take(100)
        return if (cleaned.endsWith(".json")) cleaned else "delies-backup.json"
    }

    // --- appearance / system ----------------------------------------------

    private fun setTheme(raw: String): String {
        val mode = JSONObject(raw).optString("mode", "system")
        val normalized = when (mode) {
            "light", "dark" -> mode
            else -> "system"
        }
        ThemeController.save(activity, normalized)
        activity.runOnUiThread { activity.applyThemeMode(normalized) }
        return ok()
    }

    private fun exactAlarmStatus(): String {
        val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        val allowed = ReminderScheduler(activity).canScheduleExact()
        return ok(JSONObject().put("supported", supported).put("allowed", allowed))
    }

    private fun requestExactAlarms(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return ok(JSONObject().put("unsupported", true))
        }
        activity.runOnUiThread {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:${activity.packageName}")
                }
                activity.startActivity(intent)
            } catch (error: Exception) {
                Log.w(TAG, "Exact alarm settings unavailable", error)
            }
        }
        return ok(JSONObject().put("unsupported", false))
    }

    private fun vibrate(raw: String): String {
        val millis = JSONObject(raw).optInt("ms", 30).coerceIn(1, 500).toLong()
        val vibrator = activity.getSystemService(Vibrator::class.java)
        if (vibrator != null && vibrator.hasVibrator()) {
            vibrator.vibrate(millis)
        }
        return ok()
    }

    private fun moveToBackground(): String {
        activity.runOnUiThread { activity.moveTaskToBack(true) }
        return ok()
    }

    private fun logFromWeb(raw: String): String {
        val payload = JSONObject(raw)
        Log.i(TAG, "web: ${payload.optString("level", "info")} ${payload.optString("message", "").take(500)}")
        return ok()
    }

    // --- helpers -----------------------------------------------------------

    private fun emitLater(event: String, payload: JSONObject) {
        activity.emitEvent(event, payload.toString())
    }

    private fun ok(data: JSONObject? = null): String {
        val envelope = JSONObject().put("ok", true)
        if (data != null) envelope.put("data", data)
        return envelope.toString()
    }

    private fun error(message: String): String =
        JSONObject().put("ok", false).put("error", message).toString()

    companion object {
        private const val TAG = "DeliesBridge"
        private const val BRIDGE_VERSION = 1
        private const val MAX_PAYLOAD_BYTES = 512 * 1024
        private const val MAX_BACKUP_CHARS = 4 * 1024 * 1024
    }
}
