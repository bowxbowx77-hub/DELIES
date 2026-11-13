package com.delies.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Real background scheduling through AlarmManager.
 *
 * One alarm is kept per enabled reminder for its next occurrence. When the alarm
 * fires, ReminderReceiver shows the notification and (for repeating reminders)
 * schedules the following occurrence. Exact alarms are used when Android allows
 * it; otherwise the scheduler degrades to inexact wake-ups, which the UI states
 * explicitly instead of pretending the timing is exact.
 */
class ReminderScheduler(private val context: Context) {

    private val alarmManager: AlarmManager? =
        context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager

    fun canScheduleExact(): Boolean {
        val manager = alarmManager ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            manager.canScheduleExactAlarms()
        } else {
            true
        }
    }

    fun requestCodeFor(reminderId: String): Int = reminderId.hashCode() and 0x7FFFFFF

    /**
     * Schedules every enabled reminder and cancels alarms of reminders that no
     * longer exist. Returns the number of alarms actually set.
     */
    fun scheduleAll(reminders: List<Reminder>): Int {
        val previous = readScheduledIds()
        val current = HashSet<String>()
        var scheduled = 0

        val now = System.currentTimeMillis()
        reminders.forEach { reminder ->
            if (!reminder.enabled) return@forEach
            val triggerAt = RecurrenceCalculator.nextTrigger(reminder, now - 1_000)
            if (triggerAt == null) return@forEach
            if (setAlarm(requestCodeFor(reminder.id), triggerAt, reminder.id, snooze = false)) {
                current.add(reminder.id)
                scheduled += 1
            }
        }

        previous.filterNot { current.contains(it) }.forEach { staleId ->
            cancel(staleId)
        }
        writeScheduledIds(current)
        return scheduled
    }

    fun schedule(reminder: Reminder): Boolean {
        if (!reminder.enabled) return false
        val triggerAt = RecurrenceCalculator.nextTrigger(reminder, System.currentTimeMillis() - 1_000) ?: return false
        val ok = setAlarm(requestCodeFor(reminder.id), triggerAt, reminder.id, snooze = false)
        if (ok) {
            val ids = readScheduledIds().toMutableSet()
            ids.add(reminder.id)
            writeScheduledIds(ids)
        }
        return ok
    }

    /** One-off snooze alarm; keeps the original recurrence untouched. */
    fun snooze(reminder: Reminder, triggerAtMillis: Long): Boolean {
        val requestCode = requestCodeFor(reminder.id) + 7
        return setAlarm(requestCode, triggerAtMillis, reminder.id, snooze = true)
    }

    fun cancel(reminderId: String) {
        val manager = alarmManager ?: return
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra(ReminderReceiver.EXTRA_ID, reminderId)
        }
        val pending = PendingIntent.getBroadcast(
            context,
            requestCodeFor(reminderId),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        manager.cancel(pending)
        val snoozeIntent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra(ReminderReceiver.EXTRA_ID, reminderId)
            putExtra(ReminderReceiver.EXTRA_SNOOZE, true)
        }
        val snoozePending = PendingIntent.getBroadcast(
            context,
            requestCodeFor(reminderId) + 7,
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        manager.cancel(snoozePending)
        val ids = readScheduledIds().toMutableSet()
        if (ids.remove(reminderId)) writeScheduledIds(ids)
        NotificationHelper.cancel(context, reminderId)
    }

    private fun setAlarm(requestCode: Int, triggerAt: Long, reminderId: String, snooze: Boolean): Boolean {
        val manager = alarmManager ?: return false
        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra(ReminderReceiver.EXTRA_ID, reminderId)
            putExtra(ReminderReceiver.EXTRA_SNOOZE, snooze)
        }
        val pending = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return try {
            if (canScheduleExact()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
                } else {
                    manager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending)
                }
            } else {
                // Inexact but still delivered while the device is idle.
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
            }
            true
        } catch (error: SecurityException) {
            Log.w(TAG, "Cannot schedule alarm for $reminderId", error)
            false
        }
    }

    private fun prefs() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun readScheduledIds(): List<String> =
        prefs().getString(KEY_SCHEDULED, "").orEmpty().split(',').filter { it.isNotBlank() }

    private fun writeScheduledIds(ids: Collection<String>) {
        prefs().edit().putString(KEY_SCHEDULED, ids.joinToString(",")).apply()
    }

    companion object {
        private const val TAG = "DeliesScheduler"
        private const val PREFS = "delies_scheduler"
        private const val KEY_SCHEDULED = "scheduled_ids"
        const val SNOOZE_MINUTES = 10L
    }
}
