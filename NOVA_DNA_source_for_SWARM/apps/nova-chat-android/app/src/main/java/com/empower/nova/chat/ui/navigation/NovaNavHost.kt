package com.empower.nova.chat.ui.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.empower.nova.chat.data.repository.NovaRepository
import com.empower.nova.chat.push.NovaPushDeepLink
import com.empower.nova.chat.ui.channel.ChannelFeedScreen
import com.empower.nova.chat.ui.chat.ChatScreen
import com.empower.nova.chat.ui.inbox.InboxScreen
import com.empower.nova.chat.ui.login.LoginScreen
import com.empower.nova.chat.ui.reports.ReportsScreen
import com.empower.nova.chat.ui.settings.SettingsScreen
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

object NovaRoutes {
    const val Login = "login"
    const val Inbox = "inbox"
    const val Chat = "chat/{threadId}/{threadTitle}"
    const val Channel = "channel/{threadId}/{threadTitle}"
    const val Settings = "settings"
    const val Reports = "reports"

    fun chatRoute(threadId: String, threadTitle: String): String =
        "chat/${Uri.encode(threadId)}/${Uri.encode(threadTitle.replace('/', ' '))}"

    fun channelRoute(threadId: String, threadTitle: String): String =
        "channel/${Uri.encode(threadId)}/${Uri.encode(threadTitle.replace('/', ' '))}"

    fun isActivityChannel(threadId: String): Boolean =
        threadId == "tasks" ||
            threadId == "approvals" ||
            threadId == "payments" ||
            threadId == "updates"
}

@HiltViewModel
class NovaNavViewModel @Inject constructor(
    private val repository: NovaRepository,
) : androidx.lifecycle.ViewModel() {
    fun isLoggedIn(): Boolean = repository.isLoggedIn()
}

@Composable
fun NovaNavHost(
    pendingDeepLink: NovaPushDeepLink? = null,
    onDeepLinkConsumed: () -> Unit = {},
    onOpenHref: (String) -> Unit = {},
    navViewModel: NovaNavViewModel = hiltViewModel(),
) {
    val navController = rememberNavController()
    var bootstrapped by remember { mutableStateOf(false) }

    fun goLogin() {
        navController.navigate(NovaRoutes.Login) {
            popUpTo(0) { inclusive = true }
        }
    }

    LaunchedEffect(Unit) {
        if (!bootstrapped && navViewModel.isLoggedIn()) {
            navController.navigate(NovaRoutes.Inbox) {
                popUpTo(NovaRoutes.Login) { inclusive = true }
            }
        }
        bootstrapped = true
    }

    LaunchedEffect(pendingDeepLink, bootstrapped) {
        val link = pendingDeepLink ?: return@LaunchedEffect
        if (!bootstrapped) return@LaunchedEffect
        if (!navViewModel.isLoggedIn()) {
            onDeepLinkConsumed()
            return@LaunchedEffect
        }
        navController.navigate(NovaRoutes.Inbox) {
            popUpTo(NovaRoutes.Login) { inclusive = true }
            launchSingleTop = true
        }
        val threadId = link.threadId?.takeIf { it.isNotBlank() }
        if (threadId != null) {
            val title = link.title?.takeIf { it.isNotBlank() } ?: "NOVA"
            val route = if (NovaRoutes.isActivityChannel(threadId)) {
                NovaRoutes.channelRoute(threadId, title)
            } else {
                NovaRoutes.chatRoute(threadId, title)
            }
            navController.navigate(route)
        } else if (!link.href.isNullOrBlank()) {
            onOpenHref(link.href)
        }
        onDeepLinkConsumed()
    }

    NavHost(
        navController = navController,
        startDestination = NovaRoutes.Login,
    ) {
        composable(NovaRoutes.Login) {
            LoginScreen(
                onLoggedIn = {
                    navController.navigate(NovaRoutes.Inbox) {
                        popUpTo(NovaRoutes.Login) { inclusive = true }
                    }
                },
            )
        }
        composable(NovaRoutes.Inbox) {
            InboxScreen(
                onOpenThread = { threadId, title ->
                    val route = if (NovaRoutes.isActivityChannel(threadId)) {
                        NovaRoutes.channelRoute(threadId, title)
                    } else {
                        NovaRoutes.chatRoute(threadId, title)
                    }
                    navController.navigate(route)
                },
                onOpenSettings = { navController.navigate(NovaRoutes.Settings) },
                onSessionExpired = { goLogin() },
            )
        }
        composable(
            route = NovaRoutes.Chat,
            arguments = listOf(
                navArgument("threadId") { type = NavType.StringType },
                navArgument("threadTitle") { type = NavType.StringType },
            ),
        ) { entry ->
            val threadId = entry.arguments?.getString("threadId") ?: "primary"
            val threadTitle = entry.arguments?.getString("threadTitle") ?: "NOVA"
            ChatScreen(
                threadId = threadId,
                threadTitle = threadTitle,
                onBack = { navController.popBackStack() },
                onSessionExpired = { goLogin() },
            )
        }
        composable(
            route = NovaRoutes.Channel,
            arguments = listOf(
                navArgument("threadId") { type = NavType.StringType },
                navArgument("threadTitle") { type = NavType.StringType },
            ),
        ) { entry ->
            val threadTitle = entry.arguments?.getString("threadTitle") ?: "Activity"
            ChannelFeedScreen(
                threadTitle = threadTitle,
                onBack = { navController.popBackStack() },
                onSessionExpired = { goLogin() },
            )
        }
        composable(NovaRoutes.Settings) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onLoggedOut = { goLogin() },
                onOpenReports = { navController.navigate(NovaRoutes.Reports) },
            )
        }
        composable(NovaRoutes.Reports) {
            ReportsScreen(
                onBack = { navController.popBackStack() },
                onSessionExpired = { goLogin() },
            )
        }
    }
}
