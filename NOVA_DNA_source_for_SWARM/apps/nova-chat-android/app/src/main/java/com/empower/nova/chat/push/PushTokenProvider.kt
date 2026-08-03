package com.empower.nova.chat.push

/**
 * FCM / push scaffold for NOVA Chat (Phase 2C).
 *
 * Blocked until a Firebase project provides `google-services.json` for each flavor
 * and the Gradle Google Services plugin is enabled. Until then this registrar is a
 * graceful no-op so the rest of Phase 2 ships without Firebase secrets.
 *
 * Enable later:
 * 1. Place `google-services.json` under `app/src/bpg/` and `app/src/saas/`.
 * 2. Add `id("com.google.gms.google-services")` + Firebase Messaging dependency.
 * 3. Implement [PushTokenProvider] with FirebaseMessaging.getInstance().token.
 * 4. Persist token via `POST /api/client/v1/devices/register` (add `fcmToken` field).
 * 5. Wire [NovaPushDeepLink] from notification tap extras into MainActivity.
 */
interface PushTokenProvider {
    /** Returns an FCM registration token, or null when Firebase is not configured. */
    suspend fun currentToken(): String?
}

/** Default no-op provider used until Firebase is wired. */
class NoOpPushTokenProvider : PushTokenProvider {
    override suspend fun currentToken(): String? = null
}

data class NovaPushDeepLink(
    val threadId: String? = null,
    val href: String? = null,
    val title: String? = null,
) {
    companion object {
        const val EXTRA_THREAD_ID = "nova_thread_id"
        const val EXTRA_HREF = "nova_href"
        const val EXTRA_TITLE = "nova_title"
    }
}

object PushRegistrar {
    @Volatile
    private var provider: PushTokenProvider = NoOpPushTokenProvider()

    fun install(provider: PushTokenProvider) {
        this.provider = provider
    }

    suspend fun registerIfAvailable(): String? = provider.currentToken()
}
