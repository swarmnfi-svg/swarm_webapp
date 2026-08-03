package com.empower.nova.chat.ui.inbox

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.empower.nova.chat.BuildConfig
import com.empower.nova.chat.data.model.ThreadRow
import com.empower.nova.chat.ui.components.EmptyState
import com.empower.nova.chat.ui.components.ErrorState
import com.empower.nova.chat.ui.components.LoadingState
import com.empower.nova.chat.ui.components.NovaTopBarTitle
import com.empower.nova.chat.ui.components.OfflineState
import com.empower.nova.chat.ui.components.SessionExpiredState
import com.empower.nova.chat.util.firstName
import com.empower.nova.chat.util.greetingForHour
import com.empower.nova.chat.util.isNetworkAvailable

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(
    onOpenThread: (threadId: String, title: String) -> Unit,
    onOpenSettings: () -> Unit,
    onSessionExpired: () -> Unit = {},
    viewModel: InboxViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val displayName = state.profile?.staff?.fullName ?: state.profile?.name ?: "there"
    val context = LocalContext.current
    val offline = !context.isNetworkAvailable()

    LaunchedEffect(Unit) {
        if (!context.isNetworkAvailable()) {
            viewModel.markOffline()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    NovaTopBarTitle(
                        title = "Inbox",
                        subtitle = if (BuildConfig.SHOW_BIOPOWER) "NOVA Chat · Biopower" else "NOVA Chat",
                    )
                },
                actions = {
                    IconButton(onClick = viewModel::refresh, enabled = !state.loading) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
    ) { padding ->
        val contentModifier = Modifier
            .fillMaxSize()
            .padding(padding)

        when {
            state.sessionExpired -> {
                SessionExpiredState(
                    modifier = contentModifier,
                    onSignIn = onSessionExpired,
                )
            }
            (state.offline || offline) && state.threads.isEmpty() && !state.loading -> {
                OfflineState(
                    modifier = contentModifier,
                    onRetry = viewModel::refresh,
                )
            }
            state.loading && state.threads.isEmpty() -> {
                LoadingState(
                    message = "Loading your inbox…",
                    modifier = contentModifier,
                )
            }
            state.error != null && state.threads.isEmpty() -> {
                ErrorState(
                    body = state.error!!,
                    modifier = contentModifier,
                    onRetry = viewModel::refresh,
                )
            }
            state.threads.isEmpty() -> {
                EmptyState(
                    title = "No conversations yet",
                    body = "When NOVA and activity channels are ready, they will appear here.",
                    modifier = contentModifier,
                    actionLabel = "Refresh",
                    onAction = viewModel::refresh,
                )
            }
            else -> {
                LazyColumn(
                    modifier = contentModifier,
                    verticalArrangement = Arrangement.spacedBy(1.dp),
                ) {
                    item {
                        Column(modifier = Modifier.padding(20.dp)) {
                            Text(
                                text = "${greetingForHour()}, ${firstName(displayName)}",
                                style = MaterialTheme.typography.headlineSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = "Messages and alerts",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
                            )
                        }
                    }
                    items(state.threads, key = { it.id }) { thread ->
                        ThreadRowItem(thread = thread, onClick = {
                            onOpenThread(thread.id, thread.title)
                        })
                    }
                }
            }
        }
    }
}

@Composable
private fun ThreadRowItem(
    thread: ThreadRow,
    onClick: () -> Unit,
) {
    val isNova = thread.kind == "primary" || thread.id == "primary"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = if (isNova) 16.dp else 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(if (isNova) 48.dp else 40.dp)
                .clip(CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = threadIcon(thread.kind),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.size(if (isNova) 28.dp else 22.dp),
            )
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = thread.title,
                    style = if (isNova) {
                        MaterialTheme.typography.titleMedium
                    } else {
                        MaterialTheme.typography.titleSmall
                    },
                    fontWeight = if (thread.pinned) FontWeight.Bold else FontWeight.SemiBold,
                )
                if (thread.pinned) {
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        "PIN",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
            }
            Text(
                text = thread.subtitle,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = if (isNova) 2 else 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
            )
        }
        if (thread.unread > 0) {
            BadgedBox(badge = { Badge { Text(thread.unread.toString()) } }) {
                Spacer(modifier = Modifier.size(8.dp))
            }
        } else {
            Icon(
                Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f),
            )
        }
    }
}

private fun threadIcon(kind: String) = when (kind) {
    "primary" -> Icons.Default.SmartToy
    "tasks" -> Icons.AutoMirrored.Filled.Assignment
    "approvals" -> Icons.Default.CheckCircle
    // Use core AccountBalance — Payments lives only in material-icons-extended and has
    // caused post-login composition crashes on some OEM builds when first resolved.
    "payments" -> Icons.Default.AccountBalance
    "updates" -> Icons.Default.Notifications
    else -> Icons.Default.Notifications
}
