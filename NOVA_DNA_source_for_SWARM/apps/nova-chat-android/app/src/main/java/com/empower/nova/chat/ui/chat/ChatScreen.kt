package com.empower.nova.chat.ui.chat

import android.Manifest
import android.content.pm.PackageManager
import android.view.KeyEvent as AndroidKeyEvent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusEvent
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.empower.nova.chat.BuildConfig
import com.empower.nova.chat.data.model.ChatLink
import com.empower.nova.chat.data.model.ChatMessage
import com.empower.nova.chat.data.model.ChatOption
import com.empower.nova.chat.data.model.MessageRole
import com.empower.nova.chat.ui.components.EmptyState
import com.empower.nova.chat.ui.components.ErrorState
import com.empower.nova.chat.ui.components.LoadingState
import com.empower.nova.chat.ui.components.MarkdownText
import com.empower.nova.chat.ui.components.NovaMark
import com.empower.nova.chat.ui.components.OfflineState
import com.empower.nova.chat.ui.components.SessionExpiredState
import com.empower.nova.chat.util.EmpowerLinkOpener
import com.empower.nova.chat.voice.NovaTts
import com.empower.nova.chat.voice.SpeechDictationSession
import kotlinx.coroutines.launch
import java.util.Locale

@OptIn(
    ExperimentalMaterial3Api::class,
    ExperimentalLayoutApi::class,
    ExperimentalFoundationApi::class,
)
@Composable
fun ChatScreen(
    threadId: String,
    threadTitle: String,
    onBack: () -> Unit,
    onSessionExpired: () -> Unit = {},
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    val context = LocalContext.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val bringIntoViewRequester = remember { BringIntoViewRequester() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(state.messages.size, state.sending, state.isPrimaryNova) {
        if (state.isPrimaryNova && state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.lastIndex)
        }
    }

    LaunchedEffect(state.toast) {
        val toast = state.toast ?: return@LaunchedEffect
        Toast.makeText(context, toast, Toast.LENGTH_LONG).show()
        viewModel.consumeToast()
    }

    var voicePending by remember { mutableStateOf(false) }
    var dictation by remember { mutableStateOf<SpeechDictationSession?>(null) }
    var novaTts by remember { mutableStateOf<NovaTts?>(null) }

    DisposableEffect(context) {
        val session = SpeechDictationSession(
            context = context,
            onListeningChanged = { listening -> viewModel.setListening(listening) },
            onTranscript = { text -> viewModel.applyVoiceTranscript(text) },
            onErrorMessage = { msg ->
                Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
            },
        )
        dictation = session
        val tts = NovaTts(
            context = context,
            onSpeakingChanged = { speaking -> viewModel.setTtsSpeaking(speaking) },
            onInitFailed = { msg ->
                Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
            },
        )
        novaTts = tts
        onDispose {
            session.destroy()
            dictation = null
            tts.destroy()
            novaTts = null
        }
    }

    LaunchedEffect(state.speakRequest) {
        val request = state.speakRequest ?: return@LaunchedEffect
        viewModel.consumeSpeakRequest()
        if (state.ttsEnabled) {
            novaTts?.speakMarkdown(request)
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            if (voicePending) {
                voicePending = false
                Toast.makeText(
                    context,
                    "Tap mic to dictate, or hold to talk — release when done",
                    Toast.LENGTH_SHORT,
                ).show()
            }
        } else {
            voicePending = false
            Toast.makeText(context, "Microphone permission needed for voice", Toast.LENGTH_SHORT).show()
        }
    }

    fun ensureMicPermission(): Boolean {
        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasPermission) {
            voicePending = true
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return false
        }
        return true
    }

    fun submitDraft() {
        if (state.sending || state.draft.isBlank()) return
        keyboardController?.hide()
        novaTts?.stop()
        viewModel.send()
    }

    Scaffold(
        modifier = Modifier
            .fillMaxSize()
            .imePadding(),
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (state.isPrimaryNova) {
                            NovaMark(size = 24.dp)
                            Spacer(modifier = Modifier.padding(horizontal = 4.dp))
                        }
                        Text(threadTitle, fontWeight = FontWeight.SemiBold)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (state.isPrimaryNova) {
                        IconButton(
                            onClick = {
                                val next = !state.ttsEnabled
                                viewModel.setTtsEnabled(next)
                                if (!next) novaTts?.stop()
                                Toast.makeText(
                                    context,
                                    if (next) "Voice replies on" else "Voice replies off",
                                    Toast.LENGTH_SHORT,
                                ).show()
                            },
                            modifier = Modifier.testTag("chat_tts_toggle"),
                        ) {
                            Icon(
                                imageVector = if (state.ttsEnabled) {
                                    Icons.AutoMirrored.Filled.VolumeUp
                                } else {
                                    Icons.AutoMirrored.Filled.VolumeOff
                                },
                                contentDescription = if (state.ttsEnabled) {
                                    "Mute voice replies"
                                } else {
                                    "Unmute voice replies"
                                },
                            )
                        }
                        TextButton(onClick = {
                            novaTts?.stop()
                            viewModel.clearChat()
                        }) {
                            Text("Clear")
                        }
                    }
                },
            )
        },
        bottomBar = {
            if (state.isPrimaryNova && !state.sessionExpired) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .background(MaterialTheme.colorScheme.surface),
                ) {
                    if (state.pendingOptions.isNotEmpty()) {
                        FlowRow(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            state.pendingOptions.forEach { option ->
                                AssistChip(
                                    onClick = { viewModel.selectOption(option) },
                                    enabled = !state.sending,
                                    label = { Text(optionChipLabel(option)) },
                                )
                            }
                        }
                    }
                    if (state.listening) {
                        Text(
                            "Listening… tap mic again to stop, or hold then release",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                        )
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedTextField(
                            value = state.draft,
                            onValueChange = viewModel::updateDraft,
                            modifier = Modifier
                                .weight(1f)
                                .testTag("chat_composer")
                                .bringIntoViewRequester(bringIntoViewRequester)
                                .onFocusEvent { focusState ->
                                    if (focusState.isFocused) {
                                        scope.launch {
                                            bringIntoViewRequester.bringIntoView()
                                        }
                                    }
                                }
                                .onPreviewKeyEvent { event ->
                                    if (
                                        event.type == KeyEventType.KeyUp &&
                                        (event.key == Key.Enter || event.nativeKeyEvent.keyCode == AndroidKeyEvent.KEYCODE_ENTER)
                                    ) {
                                        if (event.isShiftPressed) {
                                            false
                                        } else {
                                            submitDraft()
                                            true
                                        }
                                    } else {
                                        false
                                    }
                                },
                            placeholder = { Text("Message NOVA…") },
                            maxLines = 4,
                            enabled = !state.sending,
                            keyboardOptions = KeyboardOptions(
                                capitalization = KeyboardCapitalization.Sentences,
                                imeAction = ImeAction.Send,
                            ),
                            keyboardActions = KeyboardActions(
                                onSend = { submitDraft() },
                            ),
                        )
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .testTag("chat_mic")
                                .pointerInput(dictation, state.sending) {
                                    detectTapGestures(
                                        onPress = {
                                            if (state.sending) return@detectTapGestures
                                            if (!ensureMicPermission()) {
                                                tryAwaitRelease()
                                                return@detectTapGestures
                                            }
                                            novaTts?.stop()
                                            dictation?.startFromPress()
                                            tryAwaitRelease()
                                            dictation?.stopFromRelease()
                                        },
                                    )
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                if (state.listening) Icons.Default.Stop else Icons.Default.Mic,
                                contentDescription = if (state.listening) {
                                    "Stop listening"
                                } else {
                                    "Tap or hold to talk"
                                },
                                tint = if (state.listening) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                },
                            )
                        }
                        IconButton(
                            onClick = { submitDraft() },
                            enabled = !state.sending && state.draft.isNotBlank(),
                            modifier = Modifier.testTag("chat_send"),
                        ) {
                            if (state.sending) {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(24.dp),
                                )
                            } else {
                                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                            }
                        }
                    }
                }
            }
        },
    ) { padding ->
        val contentModifier = Modifier
            .fillMaxSize()
            .padding(padding)

        Box(modifier = contentModifier) {
            when {
                state.sessionExpired -> {
                    SessionExpiredState(
                        modifier = Modifier.fillMaxSize(),
                        onSignIn = onSessionExpired,
                    )
                }
                state.offline && state.messages.isEmpty() && !state.loading -> {
                    OfflineState(
                        modifier = Modifier.fillMaxSize(),
                        onRetry = viewModel::loadMessages,
                    )
                }
                state.loading -> {
                    LoadingState(
                        message = if (state.isPrimaryNova) "Opening NOVA…" else "Loading activity…",
                        modifier = Modifier.fillMaxSize(),
                    )
                }
                state.error != null && state.messages.isEmpty() -> {
                    ErrorState(
                        body = state.error!!,
                        modifier = Modifier.fillMaxSize(),
                        onRetry = viewModel::loadMessages,
                    )
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 12.dp),
                        state = listState,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (state.messages.isEmpty()) {
                            item {
                                if (state.isPrimaryNova) {
                                    EmptyState(
                                        title = "Ask NOVA anything",
                                        body = "Try a question about tasks, attendance, or today’s brief. Tap or hold the mic to dictate.",
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 32.dp),
                                    )
                                } else {
                                    EmptyState(
                                        title = "No alerts yet",
                                        body = "New tasks, approvals, payments, and updates show here as chat-style messages — latest on top.",
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 32.dp),
                                    )
                                }
                            }
                        }
                        items(state.messages, key = { it.id }) { message ->
                            if (!state.isPrimaryNova || message.role == MessageRole.SYSTEM) {
                                ActivityMessageRow(
                                    message = message,
                                    erpOrigin = BuildConfig.ERP_ORIGIN,
                                )
                            } else {
                                MessageBubble(
                                    message = message,
                                    erpOrigin = BuildConfig.ERP_ORIGIN,
                                    saving = state.savingReportId == message.id,
                                    ttsSpeaking = state.ttsSpeaking,
                                    onSaveReport = { viewModel.saveReport(message) },
                                    onAskDeeper = { viewModel.askDeeper(message) },
                                    onSelectOption = viewModel::selectOption,
                                    onSpeak = {
                                        if (state.ttsSpeaking) {
                                            novaTts?.stop()
                                        } else {
                                            viewModel.requestSpeak(message.content)
                                        }
                                    },
                                )
                            }
                        }
                        if (state.sending) {
                            item(key = "nova-typing") {
                                Text(
                                    "NOVA is thinking…",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                                    modifier = Modifier.padding(vertical = 8.dp, horizontal = 4.dp),
                                )
                            }
                        }
                    }
                }
            }

            state.error?.takeIf { state.messages.isNotEmpty() }?.let { err ->
                Snackbar(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(12.dp),
                    action = {
                        TextButton(onClick = viewModel::clearError) {
                            Text("Dismiss")
                        }
                    },
                ) {
                    Text(err)
                }
            }
        }
    }
}

@Composable
private fun ActivityMessageRow(
    message: ChatMessage,
    erpOrigin: String,
) {
    val context = LocalContext.current
    val scheme = MaterialTheme.colorScheme
    val href = message.href?.takeIf { it.isNotBlank() }
    val body = message.meta?.takeIf { it.isNotBlank() && it != message.title }
        ?: message.content.takeIf { it.isNotBlank() && it != message.title }
    val timeLabel = formatActivityTime(message.at)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(
                if (message.read) {
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
                text = message.title?.takeIf { it.isNotBlank() } ?: "Update",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = if (message.read) FontWeight.Medium else FontWeight.SemiBold,
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
            message.status?.takeIf { it.isNotBlank() }?.let { add(it) }
            message.amountLabel?.takeIf { it.isNotBlank() }?.let { add(it) }
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
                maxLines = 3,
            )
        }

        if (href != null) {
            Spacer(modifier = Modifier.padding(top = 4.dp))
            TextButton(
                onClick = { openEmpowerLink(context, href, erpOrigin) },
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
                val day = zoned.format(java.time.format.DateTimeFormatter.ofPattern("d MMM", Locale.getDefault()))
                "$day · $time"
            }
            else -> {
                val day = zoned.format(java.time.format.DateTimeFormatter.ofPattern("d MMM yyyy", Locale.getDefault()))
                "$day · $time"
            }
        }
    }.getOrNull()
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MessageBubble(
    message: ChatMessage,
    erpOrigin: String,
    saving: Boolean,
    ttsSpeaking: Boolean,
    onSaveReport: () -> Unit,
    onAskDeeper: () -> Unit,
    onSelectOption: (ChatOption) -> Unit,
    onSpeak: () -> Unit,
) {
    val context = LocalContext.current
    val isUser = message.role == MessageRole.USER
    val alignment = if (isUser) Alignment.CenterEnd else Alignment.CenterStart
    val bubbleColor = when (message.role) {
        MessageRole.USER -> MaterialTheme.colorScheme.primary
        MessageRole.ASSISTANT -> MaterialTheme.colorScheme.surfaceVariant
        MessageRole.SYSTEM -> MaterialTheme.colorScheme.secondaryContainer
    }
    val textColor = when (message.role) {
        MessageRole.USER -> MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.onSurface
    }
    val href = message.href?.takeIf { it.isNotBlank() }
    val answerLinks = message.links.filter { it.href.isNotBlank() }

    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = alignment) {
        Column(
            modifier = Modifier
                .widthIn(max = 320.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(bubbleColor)
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            message.title?.let {
                MarkdownText(
                    text = it,
                    style = MaterialTheme.typography.titleSmall,
                    color = textColor,
                )
                Spacer(modifier = Modifier.padding(bottom = 4.dp))
            }
            MarkdownText(text = message.content, color = textColor)

            message.provenanceLabel?.let { label ->
                Spacer(modifier = Modifier.padding(top = 8.dp))
                SuggestionChip(
                    onClick = {},
                    enabled = false,
                    label = {
                        Text(
                            label,
                            style = MaterialTheme.typography.labelSmall,
                        )
                    },
                )
            }

            if (answerLinks.isNotEmpty()) {
                Spacer(modifier = Modifier.padding(top = 8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    answerLinks.forEach { link ->
                        AssistChip(
                            onClick = {
                                openEmpowerLink(context, link.href, erpOrigin)
                            },
                            label = { Text(linkChipLabel(link)) },
                        )
                    }
                }
            }

            if (message.options.isNotEmpty() && message.role == MessageRole.ASSISTANT) {
                Spacer(modifier = Modifier.padding(top = 8.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    message.options.forEach { option ->
                        AssistChip(
                            onClick = { onSelectOption(option) },
                            label = { Text(optionChipLabel(option)) },
                        )
                    }
                }
            }

            if (message.role == MessageRole.ASSISTANT) {
                Spacer(modifier = Modifier.padding(top = 8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = onSpeak,
                        modifier = Modifier.testTag("chat_speak"),
                    ) {
                        Text(if (ttsSpeaking) "Stop" else "Speak")
                    }
                    if (message.canSaveReport) {
                        OutlinedButton(onClick = onSaveReport, enabled = !saving) {
                            Text(if (saving) "Saving…" else "Save report")
                        }
                    }
                    if (message.canAskDeeper) {
                        TextButton(onClick = onAskDeeper) {
                            Text("Ask deeper")
                        }
                    }
                }
            }

            href?.let { link ->
                Spacer(modifier = Modifier.padding(top = 8.dp))
                TextButton(
                    onClick = { openEmpowerLink(context, link, erpOrigin) },
                    modifier = Modifier.padding(start = 0.dp),
                ) {
                    Text("Open in emPOWER")
                }
            }
        }
    }
}

private fun linkChipLabel(link: ChatLink): String =
    link.title?.takeIf { it.isNotBlank() }
        ?: link.label?.takeIf { it.isNotBlank() }
        ?: "Open in emPOWER"

private fun optionChipLabel(option: ChatOption): String =
    if (option.n > 0) "${option.n}. ${option.label}" else option.label

private fun openEmpowerLink(
    context: android.content.Context,
    href: String,
    erpOrigin: String,
) {
    EmpowerLinkOpener.open(
        context = context,
        href = href,
        erpOrigin = erpOrigin,
        erpPackageId = BuildConfig.ERP_PACKAGE_ID,
    )
}
