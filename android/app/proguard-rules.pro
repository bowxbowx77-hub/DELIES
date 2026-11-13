# DELIES release rules

# JavaScript bridge: methods are called by name from WebView.
-keepclassmembers class com.delies.app.DeliesBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.delies.app.DeliesBridge { *; }

# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.delies.app.Reminder { *; }
-keepclassmembers class com.delies.app.Recurrence { *; }
-keepclassmembers class com.delies.app.ReminderList { *; }
-keep,includedescriptorclasses class com.delies.app.**$$serializer { *; }

# Keep the app name of the launcher activity
-keep class com.delies.app.MainActivity { *; }
