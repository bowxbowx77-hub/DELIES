package com.delies.app

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate

/** Creates notification channels and applies the stored theme before any UI. */
class DeliesApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        NotificationHelper.ensureChannels(this)
        AppCompatDelegate.setDefaultNightMode(ThemeController.modeFor(this))
    }
}

/** Theme preference shared with the web settings screen. */
object ThemeController {
    private const val PREFS = "delies_theme"
    private const val KEY_MODE = "mode"

    fun save(context: android.content.Context, mode: String) {
        context.applicationContext
            .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_MODE, normalize(mode))
            .apply()
    }

    fun load(context: android.content.Context): String =
        context.applicationContext
            .getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
            .getString(KEY_MODE, "system")
            ?.let { normalize(it) } ?: "system"

    fun modeFor(context: android.content.Context): Int = when (load(context)) {
        "light" -> AppCompatDelegate.MODE_NIGHT_NO
        "dark" -> AppCompatDelegate.MODE_NIGHT_YES
        else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
    }

    private fun normalize(mode: String): String = when (mode) {
        "light", "dark", "system" -> mode
        else -> "system"
    }
}
