package com.empower.nova.chat.data.repository

import com.empower.nova.chat.data.TokenStore
import com.empower.nova.chat.data.api.NovaApiService
import com.empower.nova.chat.data.api.PackPayload
import com.empower.nova.chat.data.api.apiErrorMessage
import com.empower.nova.chat.data.model.ChatHistoryTurn
import com.empower.nova.chat.data.model.ChatMessage
import com.empower.nova.chat.data.model.ChatProvenance
import com.empower.nova.chat.data.model.ClearChatRequest
import com.empower.nova.chat.data.model.LoginRequest
import com.empower.nova.chat.data.model.MeProfile
import com.empower.nova.chat.data.model.MfaRequiredException
import com.empower.nova.chat.data.model.MfaVerifyRequest
import com.empower.nova.chat.data.model.ReportListItem
import com.empower.nova.chat.data.model.SaveReportRequest
import com.empower.nova.chat.data.model.SendChatRequest
import com.empower.nova.chat.data.model.SendChatResult
import com.empower.nova.chat.data.model.ThreadRow
import com.empower.nova.chat.data.model.toUi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/** Subtle attribution for assistant bubbles when tools/provenance are present. */
internal fun provenanceChipLabel(
    toolsUsed: List<String>,
    provenance: ChatProvenance?,
): String? {
    val hasErpTools = toolsUsed.any { tool ->
        !tool.startsWith("presentation:") &&
            tool !in setOf("help", "greeting", "meta", "lexicon")
    }
    return when {
        hasErpTools -> "From emPOWER data"
        toolsUsed.isNotEmpty() || provenance != null -> "NOVA summary"
        else -> null
    }
}

internal fun canAskDeeper(toolsUsed: List<String>): Boolean {
    val hasErpTools = toolsUsed.any { tool ->
        !tool.startsWith("presentation:") &&
            tool !in setOf("help", "greeting", "meta", "lexicon", "clarify", "clarify_reask")
    }
    val alreadyHybrid = toolsUsed.any { it.contains("hybrid") || it.contains("llm") }
    return hasErpTools && !alreadyHybrid
}

@Singleton
class NovaRepository @Inject constructor(
    private val api: NovaApiService,
    private val tokenStore: TokenStore,
) {
    fun isLoggedIn(): Boolean = tokenStore.isLoggedIn()

    suspend fun login(email: String, password: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val response = api.login(
                LoginRequest(
                    email = email.trim(),
                    password = password,
                    deviceId = tokenStore.deviceId,
                    installId = tokenStore.installId,
                ),
            )
            when {
                !response.ok -> Result.failure(Exception(response.message ?: "Login failed"))
                response.status == "token-ready" && !response.accessToken.isNullOrBlank() -> {
                    tokenStore.saveTokens(
                        accessToken = response.accessToken,
                        refreshToken = response.refreshToken,
                        expiresInSeconds = response.expiresIn,
                    )
                    Result.success(Unit)
                }
                response.status == "mfa-required" -> Result.failure(MfaRequiredException())
                else -> Result.failure(Exception("Unexpected login status: ${response.status ?: "unknown"}"))
            }
        } catch (error: Exception) {
            Result.failure(Exception(apiErrorMessage(error, "Login failed"), error))
        }
    }

    suspend fun verifyMfa(email: String, password: String, code: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            try {
                val response = api.verifyMfa(
                    MfaVerifyRequest(
                        email = email.trim(),
                        password = password,
                        code = code.trim(),
                        deviceId = tokenStore.deviceId,
                    ),
                )
                when {
                    !response.ok -> Result.failure(
                        Exception(response.message ?: response.error ?: "MFA verification failed"),
                    )
                    response.status == "token-ready" && !response.accessToken.isNullOrBlank() -> {
                        tokenStore.saveTokens(
                            accessToken = response.accessToken,
                            refreshToken = response.refreshToken,
                            expiresInSeconds = response.expiresIn,
                        )
                        Result.success(Unit)
                    }
                    else -> Result.failure(Exception(response.message ?: "MFA verification failed"))
                }
            } catch (error: Exception) {
                Result.failure(Exception(apiErrorMessage(error, "MFA verification failed"), error))
            }
        }

    suspend fun logout() {
        withContext(Dispatchers.IO) {
            tokenStore.clearSession()
        }
    }

    suspend fun profile(): Result<MeProfile> = withContext(Dispatchers.IO) {
        try {
            Result.success(api.me().me)
        } catch (error: Throwable) {
            Result.failure(Exception(apiErrorMessage(error, "Could not load profile"), error))
        }
    }

    suspend fun threads(): Result<List<ThreadRow>> = withContext(Dispatchers.IO) {
        try {
            val response = api.threads()
            if (!response.ok) {
                Result.failure(Exception(response.error ?: "Failed to load inbox"))
            } else {
                // Drop blank ids and de-dupe so LazyColumn keys stay unique.
                val cleaned = response.threads
                    .filter { it.id.isNotBlank() }
                    .distinctBy { it.id }
                Result.success(cleaned)
            }
        } catch (error: Throwable) {
            Result.failure(Exception(apiErrorMessage(error, "Failed to load inbox"), error))
        }
    }

    suspend fun messages(threadId: String): Result<Pair<List<ChatMessage>, String?>> =
        withContext(Dispatchers.IO) {
            try {
                val response = api.messages(threadId)
                if (!response.ok) {
                    Result.failure(Exception(response.error ?: "Failed to load messages"))
                } else {
                    val conversationId = response.conversationId
                    if (threadId == "primary" && conversationId != null) {
                        tokenStore.conversationId = conversationId
                    }
                    Result.success(
                        response.messages
                            .map { it.toUi() }
                            .distinctBy { it.id } to conversationId,
                    )
                }
            } catch (error: Throwable) {
                Result.failure(Exception(apiErrorMessage(error, "Failed to load messages"), error))
            }
        }

    suspend fun sendMessage(
        message: String,
        history: List<ChatHistoryTurn>,
    ): Result<SendChatResult> = withContext(Dispatchers.IO) {
        try {
            val response = api.sendChat(
                SendChatRequest(
                    message = message,
                    conversationId = tokenStore.conversationId,
                    history = history,
                ),
            )
            if (!response.ok) {
                Result.failure(
                    Exception(
                        response.message?.takeIf { it.isNotBlank() }
                            ?: response.error?.takeIf { it.isNotBlank() }
                            ?: "NOVA could not answer",
                    ),
                )
            } else {
                response.conversationId?.let { tokenStore.conversationId = it }
                val toolsUsed = response.toolsUsed
                val links = response.links.filter { it.href.isNotBlank() }
                val options = response.options
                val answer = response.answer?.trim().orEmpty()
                if (answer.isEmpty()) {
                    return@withContext Result.failure(
                        Exception("NOVA returned an empty answer. Try again."),
                    )
                }
                val pack = response.pack?.takeIf { it.isNotEmpty() }?.asMap()
                val label = provenanceChipLabel(toolsUsed, response.provenance)
                Result.success(
                    SendChatResult(
                        answer = answer,
                        conversationId = response.conversationId,
                        links = links,
                        toolsUsed = toolsUsed,
                        provenanceLabel = label,
                        canSaveReport = response.canSaveReport || pack != null,
                        pack = pack,
                        options = options,
                        canAskDeeper = canAskDeeper(toolsUsed),
                    ),
                )
            }
        } catch (error: Exception) {
            Result.failure(Exception(apiErrorMessage(error, "NOVA could not answer"), error))
        }
    }

    suspend fun clearChat(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val conversationId = tokenStore.conversationId
            val response = api.clearChat(ClearChatRequest(conversationId = conversationId))
            tokenStore.conversationId = null
            if (!response.ok) {
                Result.failure(Exception(response.error ?: "Could not clear chat"))
            } else {
                Result.success(Unit)
            }
        } catch (error: Exception) {
            tokenStore.conversationId = null
            Result.failure(Exception(apiErrorMessage(error, "Could not clear chat"), error))
        }
    }

    suspend fun saveReport(
        title: String,
        narrative: String,
        pack: Map<String, Any?>,
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val response = api.saveReport(
                SaveReportRequest(
                    title = title,
                    narrative = narrative,
                    pack = PackPayload(pack),
                ),
            )
            if (!response.ok || response.reportId.isNullOrBlank()) {
                Result.failure(Exception(response.error ?: "Could not save report"))
            } else {
                Result.success(response.reportId)
            }
        } catch (error: Exception) {
            Result.failure(Exception(apiErrorMessage(error, "Could not save report"), error))
        }
    }

    suspend fun reports(): Result<List<ReportListItem>> =
        withContext(Dispatchers.IO) {
            try {
                val response = api.reports()
                if (!response.error.isNullOrBlank()) {
                    Result.failure(Exception(response.error))
                } else {
                    Result.success(response.items)
                }
            } catch (error: Exception) {
                Result.failure(Exception(apiErrorMessage(error, "Could not load reports"), error))
            }
        }

    suspend fun downloadReportBytes(id: String, format: String): Result<ByteArray> =
        withContext(Dispatchers.IO) {
            try {
                val body = api.downloadReport(id, format = format)
                val bytes = body.bytes()
                if (bytes.isEmpty()) {
                    Result.failure(Exception("Report download was empty"))
                } else {
                    Result.success(bytes)
                }
            } catch (error: Exception) {
                Result.failure(Exception(apiErrorMessage(error, "Could not download report"), error))
            }
        }

    suspend fun downloadReportText(id: String): Result<String> = withContext(Dispatchers.IO) {
        try {
            val body = api.downloadReport(id, format = "txt")
            val text = body.string()
            if (text.isBlank()) {
                Result.failure(Exception("Report download was empty"))
            } else {
                Result.success(text)
            }
        } catch (error: Exception) {
            Result.failure(Exception(apiErrorMessage(error, "Could not download report"), error))
        }
    }

    suspend fun deleteReport(id: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val response = api.deleteReport(id)
            if (!response.ok) {
                Result.failure(Exception(response.error ?: "Could not delete report"))
            } else {
                Result.success(Unit)
            }
        } catch (error: Exception) {
            Result.failure(Exception(apiErrorMessage(error, "Could not delete report"), error))
        }
    }

    suspend fun regenerateReport(id: String): Result<String?> = withContext(Dispatchers.IO) {
        try {
            val response = api.regenerateReport(id)
            if (!response.ok) {
                Result.failure(Exception(response.error ?: "Could not regenerate report"))
            } else {
                Result.success(response.reportId)
            }
        } catch (error: Exception) {
            Result.failure(Exception(apiErrorMessage(error, "Could not regenerate report"), error))
        }
    }
}
