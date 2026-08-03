package com.empower.nova.chat.ui.channel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.empower.nova.chat.data.model.ChatMessage
import com.empower.nova.chat.data.repository.NovaRepository
import com.empower.nova.chat.util.isOfflineError
import com.empower.nova.chat.util.isUnauthorizedError
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChannelFeedUiState(
    val loading: Boolean = true,
    val items: List<ChatMessage> = emptyList(),
    val error: String? = null,
    val offline: Boolean = false,
    val sessionExpired: Boolean = false,
)

@HiltViewModel
class ChannelFeedViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: NovaRepository,
) : ViewModel() {
    private val threadId: String = savedStateHandle.get<String>("threadId") ?: "updates"

    private val _uiState = MutableStateFlow(ChannelFeedUiState())
    val uiState: StateFlow<ChannelFeedUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                loading = true,
                error = null,
                offline = false,
                sessionExpired = false,
            )
            repository.messages(threadId)
                .onSuccess { (messages, _) ->
                    // Latest-first — matches threads-service channel feeds.
                    val ordered = messages.sortedByDescending { it.at }
                    _uiState.value = _uiState.value.copy(
                        loading = false,
                        items = ordered,
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
                            else -> err.message ?: "Could not load activity"
                        },
                    )
                }
        }
    }
}
