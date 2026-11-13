package com.delies.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.time.Instant

/**
 * Hosts the bundled DELIES web application in a hardened WebView.
 *
 *  - Content is served from https://appassets.androidplatform.net (a real secure
 *    origin), so IndexedDB, service workers-free storage and crypto APIs behave
 *    exactly as in the browser — no file:// origin restrictions.
 *  - File/system access from the page is disabled and navigation outside the app
 *    origin is blocked.
 *  - Native capabilities (notifications, alarms, file export, theme) are exposed
 *    through a single allow-listed JavaScript bridge.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var errorView: View
    private lateinit var assetLoader: WebViewAssetLoader
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var loadFailed = false

    private val openDocumentLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback
            filePathCallback = null
            if (result.resultCode == RESULT_OK) {
                val uri = result.data?.data
                callback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
            } else {
                callback?.onReceiveValue(null)
            }
        }

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            emitEvent("notification-permission", JSONObject().put("granted", granted).toString())
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        current = WeakReference(this)
        webView = findViewById(R.id.webView)
        progress = findViewById(R.id.progress)
        errorView = findViewById(R.id.errorView)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        }

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(APP_HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        configureWebView()
        webView.addJavascriptInterface(DeliesBridge(this) { webView.url }, "DELIESNative")

        findViewById<Button>(R.id.retryButton).setOnClickListener {
            errorView.visibility = View.GONE
            loadFailed = false
            webView.loadUrl(START_URL)
        }

        registerBackHandling()

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.delies_graphite))
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.mediaPlaybackRequiresUserGesture = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.setGeolocationEnabled(false)
        settings.userAgentString = "${settings.userAgentString} DELIES/${BuildConfig.VERSION_NAME}"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.safeBrowsingEnabled = true
        }
        @Suppress("DEPRECATION")
        run {
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                // Only the bundled origin is allowed to load inside the WebView.
                return !url.startsWith(APP_ORIGIN)
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    loadFailed = true
                    progress.visibility = View.GONE
                    errorView.visibility = View.VISIBLE
                    Log.e(TAG, "WebView main frame error: ${error.description}")
                }
            }

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                if (request.isForMainFrame) {
                    loadFailed = true
                    progress.visibility = View.GONE
                    errorView.visibility = View.VISIBLE
                    Log.e(TAG, "WebView HTTP error: ${errorResponse.statusCode}")
                }
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                Log.e(TAG, "WebView renderer gone, restarting activity (crashed=${detail.didCrash()})")
                recreate()
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progress.visibility = if (newProgress < 100 && !loadFailed) View.VISIBLE else View.GONE
            }

            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                Log.i("DeliesWeb", "${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                return true
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain"))
                    }
                    openDocumentLauncher.launch(intent)
                    true
                } catch (error: Exception) {
                    Log.e(TAG, "File chooser failed", error)
                    filePathCallback = null
                    false
                }
            }
        }
    }

    private fun registerBackHandling() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // The web layer decides first (closing dialogs/sheets, in-app
                // navigation); if it does not consume the event, WebView history
                // handles it and finally the app goes to the background.
                webView.evaluateJavascript(
                    "(function(){try{return (window.DELIESBridge && window.DELIESBridge.handleBack)?window.DELIESBridge.handleBack():'false'}catch(e){return 'false'}})()"
                ) { result ->
                    val consumed = result != null && result.contains("true")
                    if (consumed) return@evaluateJavascript
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        moveTaskToBack(true)
                    }
                }
            }
        })
    }

    /** Called by the bridge when the web layer asks for POST_NOTIFICATIONS. */
    fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val state = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            if (state == PackageManager.PERMISSION_GRANTED) {
                emitEvent("notification-permission", JSONObject().put("granted", true).toString())
                return
            }
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            emitEvent("notification-permission", JSONObject().put("granted", true).toString())
        }
    }

    fun applyThemeMode(mode: String) {
        val nightMode = when (mode) {
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
        if (AppCompatDelegate.getDefaultNightMode() != nightMode) {
            AppCompatDelegate.setDefaultNightMode(nightMode)
        }
    }

    /** Pushes an event into the web layer (reminder fired, permission result…). */
    fun emitEvent(name: String, payloadJson: String) {
        runOnUiThread {
            if (isFinishing || isDestroyed) return@runOnUiThread
            val script = "window.DELIESBridge && window.DELIESBridge.emit(" +
                JSONObject.quote(name) + "," + JSONObject.quote(payloadJson) + ")"
            webView.evaluateJavascript(script, null)
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        if (current?.get() === this) current = null
        try {
            webView.stopLoading()
            webView.destroy()
        } catch (error: Exception) {
            Log.w(TAG, "WebView destroy failed", error)
        }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "DeliesMain"
        const val APP_HOST = "appassets.androidplatform.net"
        const val APP_ORIGIN = "https://$APP_HOST"
        const val START_URL = "$APP_ORIGIN/assets/www/index.html"

        private var current: WeakReference<MainActivity>? = null

        /** Called from the alarm receiver thread. */
        fun publishReminderFired(reminder: Reminder) {
            val activity = current?.get() ?: return
            val payload = JSONObject()
                .put("reminderId", reminder.id)
                .put("title", reminder.title)
                .put("firedAt", Instant.now().toString())
                .put("action", "fired")
            activity.emitEvent("reminder-fired", payload.toString())
        }
    }
}
