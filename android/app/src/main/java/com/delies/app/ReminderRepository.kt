package com.delies.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.time.Instant

/**
 * Native mirror of the reminder list (SQLite).
 *
 * The web layer keeps the user's data in IndexedDB; Kotlin stores only what is
 * needed to survive process death, reboots and to show notifications while the
 * WebView is not running. All access is serialised on a single instance.
 */
class ReminderRepository private constructor(context: Context) {

    private val helper = Db(context.applicationContext)

    @Synchronized
    fun replaceAll(reminders: List<Reminder>) {
        val db = helper.writableDatabase
        db.beginTransaction()
        try {
            db.delete(TABLE_REMINDERS, null, null)
            reminders.forEach { reminder ->
                db.insertWithOnConflict(TABLE_REMINDERS, null, valuesOf(reminder), SQLiteDatabase.CONFLICT_REPLACE)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun all(): List<Reminder> {
        val result = ArrayList<Reminder>()
        helper.readableDatabase.rawQuery(
            "SELECT id, title, notes, at, recurrence, enabled FROM $TABLE_REMINDERS ORDER BY at ASC",
            null
        ).use { cursor ->
            while (cursor.moveToNext()) {
                result.add(
                    Reminder(
                        id = cursor.getString(0),
                        title = cursor.getString(1) ?: "",
                        notes = cursor.getString(2) ?: "",
                        at = cursor.getString(3) ?: "",
                        recurrence = Reminders.decodeRecurrence(cursor.getString(4)),
                        enabled = cursor.getInt(5) != 0
                    )
                )
            }
        }
        return result
    }

    @Synchronized
    fun find(id: String): Reminder? {
        return helper.readableDatabase.rawQuery(
            "SELECT id, title, notes, at, recurrence, enabled FROM $TABLE_REMINDERS WHERE id = ? LIMIT 1",
            arrayOf(id)
        ).use { cursor ->
            if (!cursor.moveToNext()) {
                null
            } else {
                Reminder(
                    id = cursor.getString(0),
                    title = cursor.getString(1) ?: "",
                    notes = cursor.getString(2) ?: "",
                    at = cursor.getString(3) ?: "",
                    recurrence = Reminders.decodeRecurrence(cursor.getString(4)),
                    enabled = cursor.getInt(5) != 0
                )
            }
        }
    }

    @Synchronized
    fun upsert(reminder: Reminder) {
        helper.writableDatabase.insertWithOnConflict(
            TABLE_REMINDERS,
            null,
            valuesOf(reminder),
            SQLiteDatabase.CONFLICT_REPLACE
        )
    }

    @Synchronized
    fun delete(id: String) {
        helper.writableDatabase.delete(TABLE_REMINDERS, "id = ?", arrayOf(id))
    }

    @Synchronized
    fun addHistory(reminderId: String, title: String, firedAtMillis: Long, action: String) {
        val values = ContentValues().apply {
            put("reminder_id", reminderId)
            put("title", title.take(Reminders.MAX_TITLE))
            put("fired_at", firedAtMillis)
            put("action", if (Reminders.isValidAction(action)) action else "fired")
        }
        helper.writableDatabase.insert(TABLE_HISTORY, null, values)
        // Keep the table bounded.
        helper.writableDatabase.execSQL(
            "DELETE FROM $TABLE_HISTORY WHERE _id NOT IN (SELECT _id FROM $TABLE_HISTORY ORDER BY fired_at DESC LIMIT 300)"
        )
    }

    @Synchronized
    fun history(limit: Int = 100): List<HistoryItem> {
        val items = ArrayList<HistoryItem>()
        helper.readableDatabase.rawQuery(
            "SELECT reminder_id, title, fired_at, action FROM $TABLE_HISTORY ORDER BY fired_at DESC LIMIT ?",
            arrayOf(limit.coerceIn(1, 300).toString())
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val firedAt = cursor.getLong(2)
                items.add(
                    HistoryItem(
                        id = "${cursor.getString(0)}-$firedAt",
                        reminderId = cursor.getString(0),
                        title = cursor.getString(1) ?: "",
                        firedAt = Instant.ofEpochMilli(firedAt).toString(),
                        action = cursor.getString(3) ?: "fired"
                    )
                )
            }
        }
        return items
    }

    @Synchronized
    fun clearHistory() {
        helper.writableDatabase.delete(TABLE_HISTORY, null, null)
    }

    private fun valuesOf(reminder: Reminder): ContentValues = ContentValues().apply {
        put("id", reminder.id)
        put("title", reminder.title.take(Reminders.MAX_TITLE))
        put("notes", reminder.notes.take(Reminders.MAX_NOTES))
        put("at", reminder.at)
        put("recurrence", Reminders.encodeRecurrence(reminder.recurrence))
        put("enabled", if (reminder.enabled) 1 else 0)
        put("updated_at", System.currentTimeMillis())
    }

    private class Db(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS $TABLE_REMINDERS (
                    id TEXT PRIMARY KEY NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    at TEXT NOT NULL DEFAULT '',
                    recurrence TEXT NOT NULL DEFAULT '{}',
                    enabled INTEGER NOT NULL DEFAULT 1,
                    updated_at INTEGER NOT NULL DEFAULT 0
                )
                """.trimIndent()
            )
            db.execSQL(
                """
                CREATE TABLE IF NOT EXISTS $TABLE_HISTORY (
                    _id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reminder_id TEXT NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    fired_at INTEGER NOT NULL,
                    action TEXT NOT NULL DEFAULT 'fired'
                )
                """.trimIndent()
            )
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_history_fired ON $TABLE_HISTORY (fired_at DESC)")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            // Version 1 is the first schema; future migrations belong here.
            onCreate(db)
        }
    }

    companion object {
        private const val DB_NAME = "delies.db"
        private const val DB_VERSION = 1
        private const val TABLE_REMINDERS = "reminders"
        private const val TABLE_HISTORY = "history"

        @Volatile
        private var instance: ReminderRepository? = null

        fun get(context: Context): ReminderRepository =
            instance ?: synchronized(this) {
                instance ?: ReminderRepository(context).also { instance = it }
            }
    }
}
