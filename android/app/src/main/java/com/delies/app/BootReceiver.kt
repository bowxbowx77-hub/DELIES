package com.delies.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlin.concurrent.thread

/**
 * Restores alarms after a reboot, an app update, a clock/timezone change or a
 * change of the exact-alarm permission. AlarmManager alarms do not survive
 * these events, so the native reminder mirror is replayed into the scheduler.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action !in HANDLED_ACTIONS) return

        val appContext = context.applicationContext
        val pendingResult = goAsync()
        thread(name = "delies-boot") {
            try {
                val reminders = ReminderRepository.get(appContext).all()
                val scheduled = ReminderScheduler(appContext).scheduleAll(reminders)
                Log.i(TAG, "Rescheduled $scheduled reminders after $action")
            } catch (error: Exception) {
                Log.e(TAG, "Rescheduling failed after $action", error)
            } finally {
                pendingResult.finish()
            }
        }
    }

    companion object {
        private const val TAG = "DeliesBoot"
        private val HANDLED_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"
        )
    }
}
