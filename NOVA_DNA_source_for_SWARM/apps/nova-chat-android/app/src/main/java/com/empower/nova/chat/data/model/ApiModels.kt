package com.empower.nova.chat.data.model

import com.empower.nova.chat.data.api.PackPayload
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class ClientApiErrorBody(
    val ok: Boolean = false,
    val error: String,
    val message: String? = null,
    val code: String? = null,
    val status: String? = null,
)

@JsonClass(generateAdapter = true)
data class LoginRequest(
    val client: String = "nova-android",
    val email: String,
    val password: String,
    val platform: String = "android",
    @Json(name = "appKind") val appKind: String = "nova",
    val deviceId: String? = null,
    val installId: String? = null,
)

@JsonClass(generateAdapter = true)
data class MfaVerifyRequest(
    val email: String,
    val password: String,
    val code: String,
    val client: String = "nova-android",
    val platform: String = "android",
    @Json(name = "appKind") val appKind: String = "nova",
    val deviceId: String? = null,
)

@JsonClass(generateAdapter = true)
data class LoginResponse(
    val ok: Boolean,
    @Json(name = "apiVersion") val apiVersion: String? = null,
    val status: String? = null,
    @Json(name = "authMode") val authMode: String? = null,
    @Json(name = "tokenType") val tokenType: String? = null,
    @Json(name = "accessToken") val accessToken: String? = null,
    @Json(name = "refreshToken") val refreshToken: String? = null,
    @Json(name = "expiresIn") val expiresIn: Int? = null,
    @Json(name = "refreshExpiresAt") val refreshExpiresAt: String? = null,
    val message: String? = null,
    val mfa: MfaStatus? = null,
    val error: String? = null,
    val code: String? = null,
)

@JsonClass(generateAdapter = true)
data class TokenRefreshRequest(
    @Json(name = "grant_type") val grantType: String = "refresh_token",
    @Json(name = "refresh_token") val refreshToken: String,
)

@JsonClass(generateAdapter = true)
data class TokenRefreshResponse(
    val ok: Boolean,
    @Json(name = "accessToken") val accessToken: String? = null,
    @Json(name = "refreshToken") val refreshToken: String? = null,
    @Json(name = "expiresIn") val expiresIn: Int? = null,
    @Json(name = "refreshExpiresAt") val refreshExpiresAt: String? = null,
    val error: String? = null,
    val code: String? = null,
    val message: String? = null,
)

@JsonClass(generateAdapter = true)
data class MfaStatus(
    val required: Boolean,
    val verified: Boolean,
    @Json(name = "challengeType") val challengeType: String? = null,
    @Json(name = "verifyPath") val verifyPath: String? = null,
)

@JsonClass(generateAdapter = true)
data class MeResponse(
    val ok: Boolean,
    val me: MeProfile,
)

@JsonClass(generateAdapter = true)
data class MeProfile(
    val id: String = "",
    val name: String = "",
    val email: String = "",
    val role: String = "",
    @Json(name = "grantedPermissions") val grantedPermissions: List<String> = emptyList(),
    val staff: StaffProfile? = null,
    val plane: String? = null,
    @Json(name = "aiAssistantEnabled") val aiAssistantEnabled: Boolean? = null,
    @Json(name = "novaEnabled") val novaEnabled: Boolean? = null,
)

@JsonClass(generateAdapter = true)
data class StaffProfile(
    val id: String = "",
    @Json(name = "staffCode") val staffCode: String = "",
    @Json(name = "fullName") val fullName: String = "",
    val designation: String? = null,
    val department: String? = null,
)

@JsonClass(generateAdapter = true)
data class ThreadsResponse(
    val ok: Boolean = false,
    val threads: List<ThreadRow> = emptyList(),
    @Json(name = "totalUnread") val totalUnread: Int = 0,
    val error: String? = null,
    val code: String? = null,
)

@JsonClass(generateAdapter = true)
data class ThreadRow(
    val id: String = "",
    val kind: String = "",
    val title: String = "",
    val subtitle: String = "",
    val href: String? = null,
    val unread: Int = 0,
    val pinned: Boolean = false,
)

@JsonClass(generateAdapter = true)
data class MessagesResponse(
    val ok: Boolean,
    @Json(name = "threadId") val threadId: String? = null,
    val messages: List<ChatMessageDto> = emptyList(),
    @Json(name = "conversationId") val conversationId: String? = null,
    @Json(name = "nextCursor") val nextCursor: String? = null,
    val error: String? = null,
    val code: String? = null,
)

@JsonClass(generateAdapter = true)
data class ChatMessageDto(
    val id: String = "",
    val role: String = "system",
    val content: String = "",
    val at: String = "",
    val href: String? = null,
    val read: Boolean? = null,
    val title: String? = null,
    val status: String? = null,
    @Json(name = "amountLabel") val amountLabel: String? = null,
    val meta: String? = null,
    val priority: String? = null,
    @Json(name = "sourceModule") val sourceModule: String? = null,
)

@JsonClass(generateAdapter = true)
data class ChatHistoryTurn(
    val role: String,
    val content: String,
)

@JsonClass(generateAdapter = true)
data class SendChatRequest(
    val message: String,
    @Json(name = "conversationId") val conversationId: String? = null,
    val history: List<ChatHistoryTurn> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class ClearChatRequest(
    @Json(name = "conversationId") val conversationId: String? = null,
)

@JsonClass(generateAdapter = true)
data class ClearChatResponse(
    val ok: Boolean,
    val error: String? = null,
)

@JsonClass(generateAdapter = true)
data class SendChatResponse(
    val ok: Boolean = false,
    val answer: String? = null,
    val links: List<ChatLink> = emptyList(),
    @Json(name = "toolsUsed") val toolsUsed: List<String> = emptyList(),
    @Json(name = "conversationId") val conversationId: String? = null,
    @Json(name = "periodLabel") val periodLabel: String? = null,
    val provenance: ChatProvenance? = null,
    val pack: PackPayload? = null,
    @Json(name = "canSaveReport") val canSaveReport: Boolean = false,
    val options: List<ChatOption> = emptyList(),
    @Json(name = "clarifyKind") val clarifyKind: String? = null,
    val error: String? = null,
    @Json(name = "errorKind") val errorKind: String? = null,
    val message: String? = null,
)

@JsonClass(generateAdapter = true)
data class ChatOption(
    val n: Int = 0,
    val id: String? = null,
    val label: String = "",
    val type: String? = null,
    val code: String? = null,
    val reply: String? = null,
)

@JsonClass(generateAdapter = true)
data class ChatLink(
    val title: String? = null,
    val label: String? = null,
    val href: String = "",
)

@JsonClass(generateAdapter = true)
data class ChatProvenance(
    val period: String? = null,
    val sources: List<String> = emptyList(),
    val freshness: String? = null,
    @Json(name = "trustWarnings") val trustWarnings: List<String> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class SaveReportRequest(
    val title: String,
    val narrative: String,
    val pack: PackPayload,
)

@JsonClass(generateAdapter = true)
data class SaveReportResponse(
    val ok: Boolean = false,
    @Json(name = "reportId") val reportId: String? = null,
    @Json(name = "expiresAt") val expiresAt: String? = null,
    val error: String? = null,
)

@JsonClass(generateAdapter = true)
data class OkResponse(
    val ok: Boolean = false,
    val error: String? = null,
    @Json(name = "reportId") val reportId: String? = null,
)

data class ChatMessage(
    val id: String,
    val role: MessageRole,
    val content: String,
    val at: String,
    val title: String? = null,
    val href: String? = null,
    val read: Boolean = false,
    val status: String? = null,
    val amountLabel: String? = null,
    val meta: String? = null,
    val priority: String? = null,
    val links: List<ChatLink> = emptyList(),
    val toolsUsed: List<String> = emptyList(),
    val provenanceLabel: String? = null,
    val canSaveReport: Boolean = false,
    val pack: Map<String, Any?>? = null,
    val options: List<ChatOption> = emptyList(),
    val canAskDeeper: Boolean = false,
)

/** Result of a successful NOVA chat send (answer + navigation chips + attribution). */
data class SendChatResult(
    val answer: String,
    val conversationId: String?,
    val links: List<ChatLink> = emptyList(),
    val toolsUsed: List<String> = emptyList(),
    val provenanceLabel: String? = null,
    val canSaveReport: Boolean = false,
    val pack: Map<String, Any?>? = null,
    val options: List<ChatOption> = emptyList(),
    val canAskDeeper: Boolean = false,
)

enum class MessageRole {
    USER,
    ASSISTANT,
    SYSTEM,
}

fun ChatMessageDto.toUi(): ChatMessage =
    ChatMessage(
        id = id.ifBlank { "msg-${at.ifBlank { System.currentTimeMillis().toString() }}" },
        role = when (role.lowercase()) {
            "user" -> MessageRole.USER
            "assistant" -> MessageRole.ASSISTANT
            else -> MessageRole.SYSTEM
        },
        content = content,
        at = at,
        title = title,
        href = href,
        read = read == true,
        status = status,
        amountLabel = amountLabel,
        meta = meta,
        priority = priority,
    )

fun MessageRole.toApiRole(): String = when (this) {
    MessageRole.USER -> "user"
    MessageRole.ASSISTANT -> "assistant"
    MessageRole.SYSTEM -> "system"
}

@JsonClass(generateAdapter = true)
data class ReportsListResponse(
    val items: List<ReportListItem> = emptyList(),
    val error: String? = null,
)

@JsonClass(generateAdapter = true)
data class ReportListItem(
    val id: String = "",
    val title: String = "",
    val packId: String? = null,
    val packVersion: String? = null,
    val sensitivity: String? = null,
    val dataAsOf: String? = null,
    val expiresAt: String? = null,
    val createdAt: String? = null,
    @Json(name = "downloadAllowed") val downloadAllowed: Boolean = true,
)

/** Exception thrown when MFA is required after password login. */
class MfaRequiredException(
    message: String = "Enter the 6-digit authenticator code",
) : Exception(message)
