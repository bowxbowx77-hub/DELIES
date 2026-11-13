package com.delies.app

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Reminder models shared with the JavaScript layer.
 *
 * The web app (assets/www) is the single owner of user data; Kotlin mirrors the
 * reminder list only so that real system alarms can be scheduled. Every value
 * arriving over the bridge is validated here before it is stored.
 */

@Serializable
data class Recurrence(
    val freq: String = "none",
    val interval: Int = 1,
    val until: String = ""
)

@Serializable
data class Reminder(
    val id: String = "",
    val title: String = "",
    val notes: String = "",
    val at: String = "",
    val recurrence: Recurrence = Recurrence(),
    val enabled: Boolean = true
)

@Serializable
internal data class ReminderList(val reminders: List<Reminder> = emptyList())

@Serializable
data class HistoryItem(
    val id: String = "",
    val reminderId: String = "",
    val title: String = "",
    val firedAt: String = "",
    val action: String = "fired"
)

object Reminders {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = false
    }

    private val FREQUENCIES = setOf("none", "daily", "weekly", "monthly", "yearly")
    private val ACTIONS = setOf("fired", "dismissed", "snoozed", "missed")
    private val ID_PATTERN = Regex("^[A-Za-z0-9_-]{1,64}$")

    const val MAX_TITLE = 200
    const val MAX_NOTES = 8000

    /** Parses the `syncReminders` payload. Returns only valid reminders. */
    fun parseList(payload: String): List<Reminder> {
        if (payload.isBlank() || payload.length > 512 * 1024) return emptyList()
        return try {
            val parsed = json.decodeFromString(ReminderList.serializer(), payload)
            parsed.reminders.mapNotNull { sanitize(it) }
        } catch (error: Exception) {
            emptyList()
        }
    }

    fun sanitize(reminder: Reminder): Reminder? {
        val id = reminder.id.trim()
        if (!ID_PATTERN.matches(id)) return null
        val at = RecurrenceCalculator.parseDateTime(reminder.at) ?: return null
        val recurrence = sanitizeRecurrence(reminder.recurrence)
        return Reminder(
            id = id,
            title = reminder.title.trim().take(MAX_TITLE).ifEmpty { "DELIES" },
            notes = reminder.notes.take(MAX_NOTES),
            at = RecurrenceCalculator.formatDateTime(at),
            recurrence = recurrence,
            enabled = reminder.enabled
        )
    }

    fun sanitizeRecurrence(recurrence: Recurrence): Recurrence {
        val freq = if (FREQUENCIES.contains(recurrence.freq)) recurrence.freq else "none"
        val interval = recurrence.interval.coerceIn(1, 99)
        val until = RecurrenceCalculator.parseDate(recurrence.until)?.let { RecurrenceCalculator.formatDate(it) } ?: ""
        return Recurrence(freq = freq, interval = interval, until = until)
    }

    fun encodeRecurrence(recurrence: Recurrence): String = json.encodeToString(Recurrence.serializer(), recurrence)

    fun decodeRecurrence(raw: String?): Recurrence {
        if (raw.isNullOrBlank()) return Recurrence()
        return try {
            json.decodeFromString(Recurrence.serializer(), raw)
        } catch (error: Exception) {
            Recurrence()
        }
    }

    fun isValidAction(action: String): Boolean = ACTIONS.contains(action)

    fun encodeHistory(items: List<HistoryItem>): String = json.encodeToString(
        kotlinx.serialization.builtins.ListSerializer(HistoryItem.serializer()),
        items
    )
}
