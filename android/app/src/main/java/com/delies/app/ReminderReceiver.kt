package com.delies.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlin.concurrent.thread

/**
 * Alarm target: shows the real system notification, records history and
 * reschedules the next occurrence of repeating reminders.
 */
class ReminderReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val reminderId = intent.getStringExtra(EXTRA_ID) ?: return
        val snoozed = intent.getBooleanExtra(EXTRA_SNOOZE, false)
        val appContext = context.applicationContext
        val pendingResult = goAsync()

        thread(name = "delies-reminder") {
            try {
                val repository = ReminderRepository.get(appContext)
                val reminder = repository.find(reminderId)
                if (reminder == null) {
                    Log.w(TAG, "Alarm for unknown reminder $reminderId")
                    return@thread
                }

                NotificationHelper.showReminder(appContext, reminder, snoozed)
                repository.addHistory(
                    reminderId = reminder.id,
                    title = reminder.title,
                    firedAtMillis = System.currentTimeMillis(),
                    action = if (snoozed) "snoozed" else "fired"
                )

                if (!snoozed && reminder.recurrence.freq != "none") {
                    ReminderScheduler(appContext).schedule(reminder)
                }

                // If the UI is alive, let it refresh immediately.
                MainActivity.publishReminderFired(reminder)
            } catch (error: Exception) {
                Log.e(TAG, "Reminder handling failed", error)
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        private const val TAG = "DeliesReminder"
        const val EXTRA_ID = "com.delies.app.extra.REMINDER_ID"
        const val EXTRA_SNOOZE = "com.delies.app.extra.SNOOZE"
    }
}
