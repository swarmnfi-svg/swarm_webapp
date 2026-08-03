package com.empower.nova.chat.ui.chat

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.empower.nova.chat.data.TokenStore
import com.empower.nova.chat.data.model.ChatHistoryTurn
import com.empower.nova.chat.data.model.ChatMessage
import com.empower.nova.chat.data.model.ChatOption
import com.empower.nova.chat.data.model.MessageRole
import com.empower.nova.chat.data.model.toApiRole
import com.empower.nova.chat.data.api.userFacingClientError
import com.empower.nova.chat.data.repository.NovaRepository
import com.empower.nova.chat.util.isOfflineError
import com.empower.nova.chat.util.isUnauthorizedError
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

data class ChatUiState(
    val loading: Boolean = true,
    val sending: Boolean = false,
    val messages: List<ChatMessage> = emptyList(),
    val draft: String = "",
    val error: String? = null,
    val isPrimaryNova: Boolean = true,
    val offline: Boolean = false,
    val sessionExpired: Boolean = false,
    val pendingOptions: List<ChatOption> = emptyList(),
    val savingReportId: String? = null,
    val toast: String? = null,
    val listening: Boolean = false,
    val ttsEnabled: Boolean = true,
    val ttsSpeaking: Boolean = false,
    /** Plain/markdown body to speak once; consumed by ChatScreen. */
    val speakRequest: String? = null,
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: NovaRepository,
    private val tokenStore: TokenStore,
) : ViewModel() {
    private val threadId: String = savedStateHandle.get<String>("threadId") ?: "primary"

    private val _uiState = MutableStateFlow(
        ChatUiState(
            isPrimaryNova = threadId == "primary",
            ttsEnabled = tokenStore.ttsEnabled,
        ),
    )
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    init {
        loadMessages()
    }

    fun loadMessages() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                loading = true,
                error = null,
                offline = false,
                sessionExpired = false,
            )
            repository.messages(threadId)
                .onSuccess { (messages, _) ->
                    val ordered = if (threadId == "primary") {
                        messages
                    } else {
                        // Channel feeds: latest on top.
                        messages.sortedByDescending { it.at }
                    }
                    _uiState.value = _uiState.value.copy(loading = false, messages = ordered)
                }
                .onFailure { err ->
                    val offline = err.isOfflineError()
                    val expired = !offline && err.isUnauthorizedError() && !repository.isLoggedIn()
                    _uiState.value = _uiState.value.copy(
                        loading = false,
                        offline = offline,
                        sessionExpired = expired,
                        error = err.message ?: "Could not load messages",
                        toast = err.message ?: "Could not load messages",
                    )
                }
        }
    }

    fun updateDraft(value: String) {
        _uiState.value = _uiState.value.copy(draft = value)
    }

    fun setListening(listening: Boolean) {
        _uiState.value = _uiState.value.copy(listening = listening)
    }

    fun setTtsEnabled(enabled: Boolean) {
        tokenStore.ttsEnabled = enabled
        _uiState.value = _uiState.value.copy(ttsEnabled = enabled)
        if (!enabled) {
            _uiState.value = _uiState.value.copy(speakRequest = null, ttsSpeaking = false)
        }
    }

    fun setTtsSpeaking(speaking: Boolean) {
        _uiState.value = _uiState.value.copy(ttsSpeaking = speaking)
    }

    fun requestSpeak(text: String) {
        val cleaned = text.trim()
        if (cleaned.isEmpty()) return
        _uiState.value = _uiState.value.copy(speakRequest = cleaned)
    }

    fun consumeSpeakRequest() {
        _uiState.value = _uiState.value.copy(speakRequest = null)
    }

    fun applyVoiceTranscript(text: String) {
        val cleaned = text.trim()
        if (cleaned.isEmpty()) return
        val existing = _uiState.value.draft.trim()
        val merged = if (existing.isEmpty()) cleaned else "$existing $cleaned"
        _uiState.value = _uiState.value.copy(draft = merged, listening = false)
    }

    fun send(overrideText: String? = null) {
        val draft = (overrideText ?: _uiState.value.draft).trim()
        if (draft.isEmpty() || _uiState.value.sending || threadId != "primary") return

        val userMessage = ChatMessage(
            id = "local-${UUID.randomUUID()}",
            role = MessageRole.USER,
            content = draft,
            at = Instant.now().toString(),
        )
        val history = (_uiState.value.messages + userMessage)
            .filter { it.role == MessageRole.USER || it.role == MessageRole.ASSISTANT }
            .takeLast(8)
            .map { ChatHistoryTurn(role = it.role.toApiRole(), content = it.content) }

        _uiState.value = _uiState.value.copy(
            draft = if (overrideText == null) "" else _uiState.value.draft,
            sending = true,
            messages = _uiState.value.messages + userMessage,
            error = null,
            pendingOptions = emptyList(),
            toast = null,
        )

        viewModelScope.launch {
            repository.sendMessage(draft, history)
                .onSuccess { result ->
                    val answer = result.answer.trim()
                    if (answer.isEmpty()) {
                        _uiState.value = _uiState.value.copy(
                            sending = false,
                            error = "NOVA returned an empty answer. Try again.",
                            toast = "NOVA returned an empty answer. Try again.",
                        )
                        return@onSuccess
                    }
                    val assistant = ChatMessage(
                        id = "local-${UUID.randomUUID()}",
                        role = MessageRole.ASSISTANT,
                        content = answer,
                        at = Instant.now().toString(),
                        links = result.links,
                        toolsUsed = result.toolsUsed,
                        provenanceLabel = result.provenanceLabel,
                        canSaveReport = result.canSaveReport,
                        pack = result.pack,
                        options = result.options,
                        canAskDeeper = result.canAskDeeper,
                    )
                    val autoSpeak = _uiState.value.ttsEnabled
                    _uiState.value = _uiState.value.copy(
                        sending = false,
                        messages = _uiState.value.messages + assistant,
                        pendingOptions = result.options,
                        draft = if (overrideText != null) "" else _uiState.value.draft,
                        error = null,
                        speakRequest = if (autoSpeak) answer else null,
                    )
                }
                .onFailure { err ->
                    val offline = err.isOfflineError()
                    val expired = !offline && err.isUnauthorizedError() && !repository.isLoggedIn()
                    val message = userFacingClientError(err, "Send failed — NOVA did not reply")
                    _uiState.value = _uiState.value.copy(
                        sending = false,
                        offline = offline,
                        sessionExpired = expired,
                        error = message,
                        toast = message,
                    )
                }
        }
    }

    fun selectOption(option: ChatOption) {
        val reply = option.reply?.takeIf { it.isNotBlank() }
            ?: option.code?.takeIf { it.isNotBlank() }
            ?: option.label
        send(overrideText = reply)
    }

    fun askDeeper(message: ChatMessage) {
        if (!message.canAskDeeper || _uiState.value.sending) return
        // Backend recognizes bare "elaborate" as a hybrid follow-up on the prior
        // answer (same facts). Do not send a long prose prompt — that re-routes
        // as a fresh ambiguous query and triggers disambiguation.
        send(overrideText = "elaborate")
    }

    fun saveReport(message: ChatMessage) {
        val pack = message.pack ?: return
        if (!message.canSaveReport || _uiState.value.savingReportId != null) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(savingReportId = message.id, toast = null)
            repository.saveReport(
                title = "NOVA report",
                narrative = message.content,
                pack = pack,
            ).onSuccess {
                _uiState.value = _uiState.value.copy(
                    savingReportId = null,
                    toast = "Report saved — see My reports in Settings",
                )
            }.onFailure { err ->
                val message = err.message ?: "Could not save report"
                _uiState.value = _uiState.value.copy(
                    savingReportId = null,
                    error = message,
                    toast = message,
                )
            }
        }
    }

    fun clearChat() {
        if (threadId != "primary") return
        viewModelScope.launch {
            repository.clearChat()
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        messages = emptyList(),
                        pendingOptions = emptyList(),
                        error = null,
                        toast = "Chat cleared",
                        speakRequest = null,
                    )
                }
                .onFailure { err ->
                    // Local clear still applied in repository; show soft message.
                    _uiState.value = _uiState.value.copy(
                        messages = emptyList(),
                        pendingOptions = emptyList(),
                        toast = err.message ?: "Chat cleared on device",
                        speakRequest = null,
                    )
                }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    fun consumeToast() {
        _uiState.value = _uiState.value.copy(toast = null)
    }
}
