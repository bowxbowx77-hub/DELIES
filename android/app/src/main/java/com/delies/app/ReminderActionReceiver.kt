package com.delies.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlin.concurrent.thread

/** Notification actions: "snooze 10 minutes" and "done". */
class ReminderActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val reminderId = intent.getStringExtra(ReminderReceiver.EXTRA_ID) ?: return
        val action = intent.action ?: return
        val appContext = context.applicationContext
        val pendingResult = goAsync()

        thread(name = "delies-reminder-action") {
            try {
                val repository = ReminderRepository.get(appContext)
                val reminder = repository.find(reminderId) ?: return@thread
                val scheduler = ReminderScheduler(appContext)

                when (action) {
                    ACTION_SNOOZE -> {
                        val triggerAt = System.currentTimeMillis() + ReminderScheduler.SNOOZE_MINUTES * 60_000L
                        scheduler.snooze(reminder, triggerAt)
                        repository.addHistory(
                            reminderId = reminder.id,
                            title = reminder.title,
                            firedAtMillis = System.currentTimeMillis(),
                            action = "snoozed"
                        )
                        MainActivity.publishReminderFired(reminder)
                    }
                    ACTION_DISMISS -> {
                        repository.addHistory(
                            reminderId = reminder.id,
                            title = reminder.title,
                            firedAtMillis = System.currentTimeMillis(),
                            action = "dismissed"
                        )
                        MainActivity.publishReminderFired(reminder)
                    }
                }
                NotificationHelper.cancel(appContext, reminderId)
            } catch (error: Exception) {
                Log.e(TAG, "Reminder action failed", error)
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        private const val TAG = "DeliesReminderAction"
        const val ACTION_SNOOZE = "com.delies.app.action.SNOOZE"
        const val ACTION_DISMISS = "com.delies.app.action.DISMISS"
    }
}
