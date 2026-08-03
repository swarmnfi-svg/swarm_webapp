package com.empower.nova.chat

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import com.empower.nova.chat.push.NovaPushDeepLink
import com.empower.nova.chat.ui.navigation.NovaNavHost
import com.empower.nova.chat.ui.theme.NovaChatTheme
import com.empower.nova.chat.util.EmpowerLinkOpener
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private var pendingDeepLink by mutableStateOf<NovaPushDeepLink?>(null)
    private var compositionError by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingDeepLink = parseDeepLink(intent)
        // Edge-to-edge + adjustResize needs Compose imePadding (ChatScreen) so the
        // composer stays above the soft keyboard. Decor fits system windows = false.
        runCatching {
            enableEdgeToEdge()
            WindowCompat.setDecorFitsSystemWindows(window, false)
        }
        try {
            setContent {
                NovaChatTheme {
                    Surface(modifier = Modifier.fillMaxSize()) {
                        val error = compositionError
                        if (error != null) {
                            StartupErrorScreen(
                                message = error,
                                onRetry = {
                                    compositionError = null
                                    recreate()
                                },
                            )
                        } else {
                            NovaNavHost(
                                pendingDeepLink = pendingDeepLink,
                                onDeepLinkConsumed = { pendingDeepLink = null },
                                onOpenHref = { href ->
                                    EmpowerLinkOpener.open(
                                        context = this,
                                        href = href,
                                        erpOrigin = BuildConfig.ERP_ORIGIN,
                                        erpPackageId = BuildConfig.ERP_PACKAGE_ID,
                                    )
                                },
                            )
                        }
                    }
                }
            }
        } catch (t: Throwable) {
            Log.e(TAG, "setContent failed", t)
            compositionError = t.message ?: t.javaClass.simpleName
            setContent {
                NovaChatTheme {
                    Surface(modifier = Modifier.fillMaxSize()) {
                        StartupErrorScreen(
                            message = compositionError ?: "Startup failed",
                            onRetry = { recreate() },
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingDeepLink = parseDeepLink(intent)
    }

    private fun parseDeepLink(intent: Intent?): NovaPushDeepLink? {
        if (intent == null) return null
        val threadId = intent.getStringExtra(NovaPushDeepLink.EXTRA_THREAD_ID)
            ?: intent.data?.getQueryParameter("threadId")
        val href = intent.getStringExtra(NovaPushDeepLink.EXTRA_HREF)
            ?: intent.data?.getQueryParameter("href")
            ?: intent.dataString?.takeIf {
                it.startsWith("http://") || it.startsWith("https://") || it.startsWith("/")
            }
        val title = intent.getStringExtra(NovaPushDeepLink.EXTRA_TITLE)
            ?: intent.data?.getQueryParameter("title")
        if (threadId.isNullOrBlank() && href.isNullOrBlank()) return null
        return NovaPushDeepLink(threadId = threadId, href = href, title = title)
    }

    companion object {
        private const val TAG = "NovaMainActivity"
    }
}

@androidx.compose.runtime.Composable
private fun StartupErrorScreen(
    message: String,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "NOVA Chat could not open",
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(top = 12.dp, bottom = 20.dp),
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
        )
        Button(onClick = onRetry) {
            Text("Try again")
        }
    }
}
