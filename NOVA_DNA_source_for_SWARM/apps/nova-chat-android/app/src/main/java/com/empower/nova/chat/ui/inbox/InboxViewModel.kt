package com.empower.nova.chat.ui.inbox

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.empower.nova.chat.data.model.MeProfile
import com.empower.nova.chat.data.model.ThreadRow
import com.empower.nova.chat.data.repository.NovaRepository
import com.empower.nova.chat.util.isOfflineError
import com.empower.nova.chat.util.isUnauthorizedError
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class InboxUiState(
    val loading: Boolean = true,
    val greeting: String = "Hello",
    val profile: MeProfile? = null,
    val threads: List<ThreadRow> = emptyList(),
    val error: String? = null,
    val sessionExpired: Boolean = false,
    val offline: Boolean = false,
)

/**
 * Payments channel visibility:
 * - Show when user has `paymentrequest.read` (from /auth/me), or a role that implies it.
 * - If permission is present but the threads API omitted Payments (older server), inject an
 *   empty Payments row so the channel is still reachable.
 * - Hide when the user has neither role nor `paymentrequest.read`.
 */
internal fun ensurePaymentsThread(
    threads: List<ThreadRow>,
    profile: MeProfile?,
): List<ThreadRow> {
    if (!canSeePaymentsChannel(profile)) {
        return threads.filterNot { it.id == "payments" || it.kind == "payments" }
    }
    if (threads.any { it.id == "payments" || it.kind == "payments" }) {
        return threads
    }
    val payments = ThreadRow(
        id = "payments",
        kind = "payments",
        title = "Payments",
        subtitle = "No payment requests waiting",
        href = "/nova/threads/payments",
        unread = 0,
        pinned = false,
    )
    val updatesIdx = threads.indexOfFirst { it.id == "updates" || it.kind == "updates" }
    return if (updatesIdx >= 0) {
        threads.toMutableList().apply { add(updatesIdx, payments) }
    } else {
        threads + payments
    }
}

/** Roles that get paymentrequest.read from RBAC MATRIX (not only DB grants). */
private val PAYMENTS_ROLES = setOf(
    "ADMIN",
    "SUPER_ADMIN",
    "MANAGER",
    "DIRECTOR",
    "ACCOUNTANT",
)

internal fun canSeePaymentsChannel(profile: MeProfile?): Boolean {
    if (profile == null) return false
    val role = profile.role.trim().uppercase()
    if (role in PAYMENTS_ROLES) return true
    return profile.grantedPermissions.any {
        it.equals("paymentrequest.read", ignoreCase = true)
    }
}

@HiltViewModel
class InboxViewModel @Inject constructor(
    private val repository: NovaRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(InboxUiState())
    val uiState: StateFlow<InboxUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun markOffline() {
        _uiState.value = _uiState.value.copy(
            loading = false,
            offline = true,
            error = null,
        )
    }

    fun refresh() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(
                    loading = true,
                    error = null,
                    offline = false,
                    sessionExpired = false,
                )
                val profileResult = repository.profile()
                val threadsResult = repository.threads()

                val profile = profileResult.getOrNull()
                if (profile != null) {
                    _uiState.value = _uiState.value.copy(profile = profile)
                }

                threadsResult
                    .onSuccess { threads ->
                        val mergedProfile = profile ?: _uiState.value.profile
                        _uiState.value = _uiState.value.copy(
                            loading = false,
                            threads = ensurePaymentsThread(threads, mergedProfile),
                            offline = false,
                            sessionExpired = false,
                            error = null,
                        )
                    }
                    .onFailure { err ->
                        val offline = err.isOfflineError()
                        val expired = !offline && err.isUnauthorizedError() && !repository.isLoggedIn()
                        if (expired) {
                            repository.logout()
                        }
                        _uiState.value = _uiState.value.copy(
                            loading = false,
                            offline = offline,
                            sessionExpired = expired,
                            error = when {
                                expired -> "Session expired. Sign in again."
                                offline -> err.message
                                else -> err.message ?: "Could not load inbox"
                            },
                        )
                    }
            } catch (t: Throwable) {
                _uiState.value = _uiState.value.copy(
                    loading = false,
                    error = t.message ?: "Could not load inbox",
                )
            }
        }
    }
}
