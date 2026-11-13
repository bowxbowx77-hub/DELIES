package com.delies.app

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * Recurrence engine for native alarm scheduling.
 *
 * This mirrors `main/js/core/dates.js` (shiftOccurrence / nextOccurrence) so the
 * APK fires reminders at exactly the same moments as the web version:
 *  - every occurrence is computed by shifting the *base* date, so month ends do
 *    not drift (31 Jan → 28 Feb → 31 Mar);
 *  - `until` is inclusive of the whole day;
 *  - a one-off reminder in the past has no next occurrence.
 *
 * Kept free of Android APIs so it is covered by plain JVM unit tests.
 */
object RecurrenceCalculator {

    private val DATE_TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm")
    private val DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")
    private const val MAX_STEPS = 4000

    fun parseDateTime(value: String?): LocalDateTime? {
        if (value.isNullOrBlank()) return null
        return try {
            LocalDateTime.parse(value.trim(), DATE_TIME)
        } catch (error: DateTimeParseException) {
            null
        }
    }

    fun parseDate(value: String?): LocalDate? {
        if (value.isNullOrBlank()) return null
        return try {
            LocalDate.parse(value.trim(), DATE)
        } catch (error: DateTimeParseException) {
            null
        }
    }

    fun formatDateTime(value: LocalDateTime): String = value.format(DATE_TIME)

    fun formatDate(value: LocalDate): String = value.format(DATE)

    fun toMillis(value: LocalDateTime, zone: ZoneId = ZoneId.systemDefault()): Long =
        value.atZone(zone).toInstant().toEpochMilli()

    /** Occurrence `steps` intervals after `base` (clamped to the month length). */
    fun shift(base: LocalDateTime, recurrence: Recurrence, steps: Int): LocalDateTime? {
        val interval = recurrence.interval.coerceIn(1, 99)
        val k = steps.coerceAtLeast(0)
        return when (recurrence.freq) {
            "daily" -> base.plusDays(interval.toLong() * k)
            "weekly" -> base.plusWeeks(interval.toLong() * k)
            "monthly" -> base.plusMonths(interval.toLong() * k)
            "yearly" -> base.plusYears(interval.toLong() * k)
            "none" -> if (k == 0) base else null
            else -> null
        }
    }

    /**
     * First occurrence strictly after [afterMillis], or null when the series has
     * ended (past one-off reminder or `until` reached).
     */
    fun nextOccurrence(
        base: LocalDateTime,
        recurrence: Recurrence,
        afterMillis: Long,
        zone: ZoneId = ZoneId.systemDefault()
    ): Long? {
        val untilMillis = parseDate(recurrence.until)?.let { date ->
            toMillis(date.plusDays(1).atStartOfDay(), zone) - 1
        }
        if (recurrence.freq == "none") {
            val baseMillis = toMillis(base, zone)
            if (baseMillis <= afterMillis) return null
            if (untilMillis != null && baseMillis > untilMillis) return null
            return baseMillis
        }
        for (step in 0..MAX_STEPS) {
            val candidate = shift(base, recurrence, step) ?: return null
            val millis = toMillis(candidate, zone)
            if (millis > afterMillis) {
                if (untilMillis != null && millis > untilMillis) return null
                return millis
            }
        }
        return null
    }

    /** Convenience: next trigger for a stored reminder, or null. */
    fun nextTrigger(reminder: Reminder, afterMillis: Long, zone: ZoneId = ZoneId.systemDefault()): Long? {
        val base = parseDateTime(reminder.at) ?: return null
        return nextOccurrence(base, reminder.recurrence, afterMillis, zone)
    }
}
