package com.empower.nova.chat.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.LockClock
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
fun LoadingState(
    message: String = "Loading…",
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(
                color = MaterialTheme.colorScheme.secondary,
                strokeWidth = 3.dp,
                modifier = Modifier.size(40.dp),
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
            )
        }
    }
}

@Composable
fun EmptyState(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    icon: ImageVector = Icons.Outlined.Inbox,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    StatePanel(
        icon = icon,
        title = title,
        body = body,
        modifier = modifier,
        primaryLabel = actionLabel,
        onPrimary = onAction,
    )
}

@Composable
fun ErrorState(
    title: String = "Something went wrong",
    body: String,
    modifier: Modifier = Modifier,
    retryLabel: String = "Try again",
    onRetry: (() -> Unit)? = null,
) {
    StatePanel(
        icon = Icons.Outlined.ErrorOutline,
        title = title,
        body = body,
        modifier = modifier,
        primaryLabel = if (onRetry != null) retryLabel else null,
        onPrimary = onRetry,
        iconTint = MaterialTheme.colorScheme.error,
    )
}

@Composable
fun OfflineState(
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
) {
    StatePanel(
        icon = Icons.Outlined.CloudOff,
        title = "You're offline",
        body = "Check your connection, then try again. NOVA Chat needs the network to load messages.",
        modifier = modifier,
        primaryLabel = if (onRetry != null) "Retry" else null,
        onPrimary = onRetry,
    )
}

@Composable
fun SessionExpiredState(
    modifier: Modifier = Modifier,
    onSignIn: () -> Unit,
) {
    StatePanel(
        icon = Icons.Outlined.LockClock,
        title = "Session expired",
        body = "Sign in again to continue chatting with NOVA.",
        modifier = modifier,
        primaryLabel = "Sign in",
        onPrimary = onSignIn,
    )
}

@Composable
private fun StatePanel(
    icon: ImageVector,
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    primaryLabel: String? = null,
    onPrimary: (() -> Unit)? = null,
    secondaryLabel: String? = null,
    onSecondary: (() -> Unit)? = null,
    iconTint: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.secondary,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(48.dp),
            )
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.65f),
                textAlign = TextAlign.Center,
            )
            if (primaryLabel != null && onPrimary != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = onPrimary, modifier = Modifier.fillMaxWidth(0.7f)) {
                    Text(primaryLabel)
                }
            }
            if (secondaryLabel != null && onSecondary != null) {
                OutlinedButton(onClick = onSecondary, modifier = Modifier.fillMaxWidth(0.7f)) {
                    Text(secondaryLabel)
                }
            }
        }
    }
}
