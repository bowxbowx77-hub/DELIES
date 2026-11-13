package com.delies.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Notification channels and reminder notifications (NotificationManager).
 * All calls are no-ops when the user has not granted POST_NOTIFICATIONS.
 */
object NotificationHelper {

    const val CHANNEL_REMINDERS = "delies_reminders"
    const val CHANNEL_SERVICE = "delies_service"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

        val reminders = NotificationChannel(
            CHANNEL_REMINDERS,
            context.getString(R.string.channel_reminders_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = context.getString(R.string.channel_reminders_description)
            enableVibration(true)
            setShowBadge(true)
        }

        val service = NotificationChannel(
            CHANNEL_SERVICE,
            "DELIES",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Служебные уведомления"
        }

        manager.createNotificationChannel(reminders)
        manager.createNotificationChannel(service)
    }

    fun permissionGranted(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val state = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            if (state != PackageManager.PERMISSION_GRANTED) return false
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun notificationIdFor(reminderId: String): Int = reminderId.hashCode() and 0x7FFFFFF

    fun showReminder(context: Context, reminder: Reminder, snoozed: Boolean = false) {
        if (!permissionGranted(context)) return
        ensureChannels(context)

        val openIntent = PendingIntent.getActivity(
            context,
            notificationIdFor(reminder.id),
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("route", "reminders")
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val snoozeIntent = PendingIntent.getBroadcast(
            context,
            notificationIdFor(reminder.id) + 1,
            Intent(context, ReminderActionReceiver::class.java).apply {
                action = ReminderActionReceiver.ACTION_SNOOZE
                putExtra(ReminderReceiver.EXTRA_ID, reminder.id)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val dismissIntent = PendingIntent.getBroadcast(
            context,
            notificationIdFor(reminder.id) + 2,
            Intent(context, ReminderActionReceiver::class.java).apply {
                action = ReminderActionReceiver.ACTION_DISMISS
                putExtra(ReminderReceiver.EXTRA_ID, reminder.id)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_REMINDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(reminder.title.ifBlank { context.getString(R.string.app_name) })
            .setContentText(reminder.notes)
            .setStyle(NotificationCompat.BigTextStyle().bigText(reminder.notes.ifBlank { reminder.title }))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openIntent)
            .setColor(ContextCompat.getColor(context, R.color.delies_purple_light))
            .addAction(R.drawable.ic_notification, context.getString(R.string.notification_snooze), snoozeIntent)
            .addAction(R.drawable.ic_notification, context.getString(R.string.notification_dismiss), dismissIntent)

        if (snoozed) builder.setSubText(context.getString(R.string.notification_snooze))

        try {
            NotificationManagerCompat.from(context).notify(notificationIdFor(reminder.id), builder.build())
        } catch (error: SecurityException) {
            // Permission revoked between the check and notify(): ignore.
        }
    }

    fun showTest(context: Context): Boolean {
        if (!permissionGranted(context)) return false
        ensureChannels(context)
        val intent = PendingIntent.getActivity(
            context,
            990001,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = NotificationCompat.Builder(context, CHANNEL_REMINDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.app_name))
            .setContentText(context.getString(R.string.notification_open))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(intent)
        return try {
            NotificationManagerCompat.from(context).notify(990001, builder.build())
            true
        } catch (error: SecurityException) {
            false
        }
    }

    fun cancel(context: Context, reminderId: String) {
        NotificationManagerCompat.from(context).cancel(notificationIdFor(reminderId))
    }
}
