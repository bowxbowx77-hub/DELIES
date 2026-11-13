package com.delies.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * The native scheduler must fire at exactly the same moments as the web engine
 * (main/js/core/dates.js). These tests lock that behaviour down.
 */
class RecurrenceCalculatorTest {

    private val zone = ZoneId.of("UTC")

    private fun at(value: String): LocalDateTime = RecurrenceCalculator.parseDateTime(value)!!

    private fun millis(value: String): Long = RecurrenceCalculator.toMillis(at(value), zone)

    private fun iso(millis: Long): String =
        RecurrenceCalculator.formatDateTime(
            LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(millis), zone)
        )

    @Test
    fun `monthly recurrence keeps month-end from drifting`() {
        val base = at("2026-01-31T09:00")
        val recurrence = Recurrence(freq = "monthly", interval = 1)
        var after = millis("2026-01-31T09:00")
        val results = mutableListOf<String>()
        repeat(4) {
            val next = RecurrenceCalculator.nextOccurrence(base, recurrence, after, zone)!!
            results.add(iso(next))
            after = next
        }
        assertEquals(
            listOf("2026-02-28T09:00", "2026-03-31T09:00", "2026-04-30T09:00", "2026-05-31T09:00"),
            results
        )
    }

    @Test
    fun `daily and weekly intervals are honoured`() {
        val base = at("2026-03-02T10:00")
        assertEquals(
            "2026-03-03T10:00",
            iso(RecurrenceCalculator.nextOccurrence(base, Recurrence("daily", 1), millis("2026-03-02T10:00"), zone)!!)
        )
        assertEquals(
            "2026-03-16T10:00",
            iso(RecurrenceCalculator.nextOccurrence(base, Recurrence("weekly", 2), millis("2026-03-02T10:00"), zone)!!)
        )
        assertEquals(
            "2027-03-02T10:00",
            iso(RecurrenceCalculator.nextOccurrence(base, Recurrence("yearly", 1), millis("2026-03-02T10:00"), zone)!!)
        )
    }

    @Test
    fun `until bound stops the series`() {
        val base = at("2026-03-02T10:00")
        val recurrence = Recurrence(freq = "daily", interval = 1, until = "2026-03-04")
        assertNull(RecurrenceCalculator.nextOccurrence(base, recurrence, millis("2026-03-05T00:00"), zone))
        assertEquals(
            "2026-03-03T10:00",
            iso(RecurrenceCalculator.nextOccurrence(base, recurrence, millis("2026-03-02T10:00"), zone)!!)
        )
    }

    @Test
    fun `one-off reminders fire once and never in the past`() {
        val base = at("2026-03-02T10:00")
        val recurrence = Recurrence()
        assertNull(RecurrenceCalculator.nextOccurrence(base, recurrence, millis("2026-03-02T10:00"), zone))
        assertEquals(
            "2026-03-02T10:00",
            iso(RecurrenceCalculator.nextOccurrence(base, recurrence, millis("2026-03-01T10:00"), zone)!!)
        )
    }

    @Test
    fun `invalid dates are rejected`() {
        assertNull(RecurrenceCalculator.parseDateTime("not a date"))
        assertNull(RecurrenceCalculator.parseDateTime("2026-02-30T10:00"))
        assertNull(RecurrenceCalculator.parseDateTime(""))
        assertNull(RecurrenceCalculator.nextTrigger(Reminder(id = "r1", at = "junk"), 0L, zone))
    }

    @Test
    fun `next trigger uses the stored reminder`() {
        val reminder = Reminder(
            id = "r1",
            title = "Лекарство",
            at = "2026-03-02T09:00",
            recurrence = Recurrence(freq = "daily", interval = 1),
            enabled = true
        )
        val next = RecurrenceCalculator.nextTrigger(reminder, millis("2026-03-05T10:00"), zone)!!
        assertEquals("2026-03-06T09:00", iso(next))
        assertTrue(next > millis("2026-03-05T10:00"))
    }
}
