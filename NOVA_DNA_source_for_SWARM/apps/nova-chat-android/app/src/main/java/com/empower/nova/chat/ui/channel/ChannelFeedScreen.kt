package com.empower.nova.chat.ui.channel

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.empower.nova.chat.BuildConfig
import com.empower.nova.chat.data.model.ChatMessage
import com.empower.nova.chat.ui.components.EmptyState
import com.empower.nova.chat.ui.components.ErrorState
import com.empower.nova.chat.ui.components.LoadingState
import com.empower.nova.chat.ui.components.OfflineState
import com.empower.nova.chat.ui.components.SessionExpiredState
import com.empower.nova.chat.util.EmpowerLinkOpener
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChannelFeedScreen(
    threadTitle: String,
    onBack: () -> Unit,
    onSessionExpired: () -> Unit = {},
    viewModel: ChannelFeedViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(threadTitle, fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::refresh, enabled = !state.loading) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
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
                SessionExpiredState(modifier = contentModifier, onSignIn = onSessionExpired)
            }
            state.offline && state.items.isEmpty() && !state.loading -> {
                OfflineState(modifier = contentModifier, onRetry = viewModel::refresh)
            }
            state.loading && state.items.isEmpty() -> {
                LoadingState(message = "Loading activity…", modifier = contentModifier)
            }
            state.error != null && state.items.isEmpty() -> {
                ErrorState(
                    body = state.error!!,
                    modifier = contentModifier,
                    onRetry = viewModel::refresh,
                )
            }
            state.items.isEmpty() -> {
                EmptyState(
                    title = "You're caught up",
                    body = "New $threadTitle alerts will show here — latest first.",
                    modifier = contentModifier,
                    actionLabel = "Refresh",
                    onAction = viewModel::refresh,
                )
            }
            else -> {
                LazyColumn(
                    modifier = contentModifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(state.items, key = { it.id }) { item ->
                        ChannelActivityRow(item = item)
                    }
                }
            }
        }
    }
}

@Composable
private fun ChannelActivityRow(item: ChatMessage) {
    val context = LocalContext.current
    val scheme = MaterialTheme.colorScheme
    val href = item.href?.takeIf { it.isNotBlank() }
    val body = item.meta?.takeIf { it.isNotBlank() && it != item.title }
        ?: item.content.takeIf { it.isNotBlank() && it != item.title }
    val timeLabel = formatActivityTime(item.at)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(
                if (item.read) {
                    scheme.surfaceVariant.copy(alpha = 0.35f)
                } else {
                    scheme.secondaryContainer.copy(alpha = 0.55f)
                },
            )
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                text = item.title?.takeIf { it.isNotBlank() } ?: "Update",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = if (item.read) FontWeight.Medium else FontWeight.SemiBold,
                color = scheme.onSurface,
                modifier = Modifier.weight(1f),
                maxLines = 2,
            )
            if (timeLabel != null) {
                Text(
                    text = timeLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onSurface.copy(alpha = 0.55f),
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }

        val metaBits = buildList {
            item.status?.takeIf { it.isNotBlank() }?.let { add(it) }
            item.amountLabel?.takeIf { it.isNotBlank() }?.let { add(it) }
        }
        if (metaBits.isNotEmpty()) {
            Spacer(modifier = Modifier.padding(top = 4.dp))
            Text(
                text = metaBits.joinToString(" · "),
                style = MaterialTheme.typography.labelMedium,
                color = scheme.secondary,
                fontWeight = FontWeight.Medium,
            )
        }

        if (!body.isNullOrBlank()) {
            Spacer(modifier = Modifier.padding(top = 4.dp))
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = scheme.onSurface.copy(alpha = 0.75f),
                maxLines = 4,
            )
        }

        if (href != null) {
            Spacer(modifier = Modifier.padding(top = 2.dp))
            TextButton(
                onClick = {
                    EmpowerLinkOpener.open(
                        context = context,
                        href = href,
                        erpOrigin = BuildConfig.ERP_ORIGIN,
                        erpPackageId = BuildConfig.ERP_PACKAGE_ID,
                    )
                },
                modifier = Modifier.padding(start = 0.dp),
            ) {
                Text("Open in emPOWER")
            }
        }
    }
}

private fun formatActivityTime(iso: String): String? {
    return runCatching {
        val instant = java.time.Instant.parse(iso)
        val zoned = instant.atZone(java.time.ZoneId.systemDefault())
        val today = java.time.LocalDate.now()
        val date = zoned.toLocalDate()
        val time = zoned.toLocalTime().format(
            java.time.format.DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault()),
        )
        when {
            date == today -> time
            date == today.minusDays(1) -> "Yesterday $time"
            date.year == today.year -> {
                val day = zoned.format(
                    java.time.format.DateTimeFormatter.ofPattern("d MMM", Locale.getDefault()),
                )
                "$day · $time"
            }
            else -> {
                val day = zoned.format(
                    java.time.format.DateTimeFormatter.ofPattern("d MMM yyyy", Locale.getDefault()),
                )
                "$day · $time"
            }
        }
    }.getOrNull()
}
