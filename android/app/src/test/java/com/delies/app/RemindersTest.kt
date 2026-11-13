package com.delies.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Validation of everything that crosses the JavaScript bridge. */
class RemindersTest {

    @Test
    fun `valid payload is parsed`() {
        val payload = """
            {"reminders":[
              {"id":"abc123","title":"Вода","notes":"2 стакана","at":"2026-03-02T09:00",
               "recurrence":{"freq":"daily","interval":2,"until":""},"enabled":true}
            ]}
        """.trimIndent()
        val list = Reminders.parseList(payload)
        assertEquals(1, list.size)
        assertEquals("Вода", list[0].title)
        assertEquals("daily", list[0].recurrence.freq)
        assertEquals(2, list[0].recurrence.interval)
    }

    @Test
    fun `unknown fields are ignored`() {
        val payload =
            """{"reminders":[{"id":"r1","title":"T","at":"2026-03-02T09:00","futureField":42}],"extra":"x"}"""
        assertEquals(1, Reminders.parseList(payload).size)
    }

    @Test
    fun `invalid entries are dropped and never reach scheduling`() {
        val payload = """
            {"reminders":[
              {"id":"../../etc/passwd","title":"bad id","at":"2026-03-02T09:00"},
              {"id":"ok1","title":"no date","at":""},
              {"id":"ok2","title":"broken date","at":"2026-99-99T09:00"},
              {"id":"ok3","title":"valid","at":"2026-03-02T09:00"}
            ]}
        """.trimIndent()
        val list = Reminders.parseList(payload)
        assertEquals(1, list.size)
        assertEquals("ok3", list[0].id)
    }

    @Test
    fun `broken json yields an empty list instead of crashing`() {
        assertTrue(Reminders.parseList("not json").isEmpty())
        assertTrue(Reminders.parseList("").isEmpty())
        assertTrue(Reminders.parseList("""{"reminders":"nope"}""").isEmpty())
    }

    @Test
    fun `recurrence is sanitised`() {
        val recurrence = Reminders.sanitizeRecurrence(Recurrence(freq = "hourly", interval = 1000, until = "nope"))
        assertEquals("none", recurrence.freq)
        assertEquals(99, recurrence.interval)
        assertEquals("", recurrence.until)

        val ok = Reminders.sanitizeRecurrence(Recurrence(freq = "weekly", interval = 0, until = "2026-03-04"))
        assertEquals("weekly", ok.freq)
        assertEquals(1, ok.interval)
        assertEquals("2026-03-04", ok.until)
    }

    @Test
    fun `titles are trimmed and clamped`() {
        val payload = """{"reminders":[{"id":"r1","title":"   ${"x".repeat(400)}   ","at":"2026-03-02T09:00"}]}"""
        val reminder = Reminders.parseList(payload).single()
        assertEquals(Reminders.MAX_TITLE, reminder.title.length)
        assertTrue(!reminder.title.startsWith(" "))
    }

    @Test
    fun `missing title falls back to the app name`() {
        val payload = """{"reminders":[{"id":"r1","title":"","at":"2026-03-02T09:00"}]}"""
        assertEquals("DELIES", Reminders.parseList(payload).single().title)
    }

    @Test
    fun `recurrence encoding round-trips`() {
        val recurrence = Recurrence(freq = "monthly", interval = 3, until = "2027-01-01")
        val encoded = Reminders.encodeRecurrence(recurrence)
        val decoded = Reminders.decodeRecurrence(encoded)
        assertEquals(recurrence, decoded)
        assertEquals(Recurrence(), Reminders.decodeRecurrence("{broken"))
        assertEquals(Recurrence(), Reminders.decodeRecurrence(null))
    }

    @Test
    fun `sanitize keeps a valid reminder unchanged`() {
        val reminder = Reminder(id = "r1", title = " T ", at = "2026-03-02T09:00")
        val sanitized = Reminders.sanitize(reminder)
        assertNotNull(sanitized)
        assertEquals("T", sanitized!!.title)
        assertNull(Reminders.sanitize(reminder.copy(id = "bad id!")))
    }
}
