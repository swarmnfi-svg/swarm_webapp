package com.empower.nova.chat.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import java.security.KeyStore
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Secure token + optional saved-credentials store.
 *
 * Crypto is **lazy** and must **never** throw from the Hilt constructor or property
 * accessors — OEM Keystore / EncryptedSharedPreferences failures fall back to plain
 * MODE_PRIVATE prefs so login → inbox can still open.
 */
@Singleton
class TokenStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    @Volatile
    private var prefsRef: SharedPreferences? = null
    private val prefsLock = Any()

    private val prefs: SharedPreferences
        get() {
            prefsRef?.let { return it }
            synchronized(prefsLock) {
                prefsRef?.let { return it }
                val created = createPrefsNeverThrow(context)
                prefsRef = created
                return created
            }
        }

    var accessToken: String?
        get() = safeGet { prefs.getString(KEY_ACCESS, null) }
        set(value) {
            safeEdit { putString(KEY_ACCESS, value) }
        }

    var refreshToken: String?
        get() = safeGet { prefs.getString(KEY_REFRESH, null) }
        set(value) {
            safeEdit { putString(KEY_REFRESH, value) }
        }

    /** Epoch millis when the current access token should be treated as expired. */
    var accessExpiresAtMs: Long
        get() = safeGet { prefs.getLong(KEY_ACCESS_EXPIRES_AT, 0L) } ?: 0L
        set(value) {
            safeEdit { putLong(KEY_ACCESS_EXPIRES_AT, value) }
        }

    var conversationId: String?
        get() = safeGet { prefs.getString(KEY_CONVERSATION, null) }
        set(value) {
            safeEdit { putString(KEY_CONVERSATION, value) }
        }

    val deviceId: String
        get() {
            val existing = safeGet { prefs.getString(KEY_DEVICE_ID, null) }
            if (!existing.isNullOrBlank()) return existing
            val created = UUID.randomUUID().toString()
            safeEdit(commit = true) { putString(KEY_DEVICE_ID, created) }
            return created
        }

    val installId: String
        get() {
            val existing = safeGet { prefs.getString(KEY_INSTALL_ID, null) }
            if (!existing.isNullOrBlank()) return existing
            val created = UUID.randomUUID().toString()
            safeEdit(commit = true) { putString(KEY_INSTALL_ID, created) }
            return created
        }

    var savePasswordEnabled: Boolean
        get() = safeGet { prefs.getBoolean(KEY_SAVE_PASSWORD, false) } ?: false
        set(value) {
            safeEdit { putBoolean(KEY_SAVE_PASSWORD, value) }
        }

    var savedEmail: String?
        get() = safeGet { prefs.getString(KEY_SAVED_EMAIL, null) }
        set(value) {
            safeEdit { putString(KEY_SAVED_EMAIL, value) }
        }

    var savedPassword: String?
        get() = safeGet { prefs.getString(KEY_SAVED_PASSWORD, null) }
        set(value) {
            safeEdit { putString(KEY_SAVED_PASSWORD, value) }
        }

    /** When true, NOVA auto-speaks new assistant replies (device TTS). Default on. */
    var ttsEnabled: Boolean
        get() = safeGet { prefs.getBoolean(KEY_TTS_ENABLED, true) } ?: true
        set(value) {
            safeEdit { putBoolean(KEY_TTS_ENABLED, value) }
        }

    /** Session is alive if we still have a refresh token (or a non-blank access token). */
    fun isLoggedIn(): Boolean =
        !refreshToken.isNullOrBlank() || !accessToken.isNullOrBlank()

    fun hasRefreshToken(): Boolean = !refreshToken.isNullOrBlank()

    fun saveTokens(
        accessToken: String,
        refreshToken: String?,
        expiresInSeconds: Int?,
    ) {
        val expiresAt = if (expiresInSeconds != null && expiresInSeconds > 0) {
            System.currentTimeMillis() + expiresInSeconds * 1000L
        } else {
            System.currentTimeMillis() + DEFAULT_ACCESS_TTL_MS
        }
        safeEdit(commit = true) {
            putString(KEY_ACCESS, accessToken)
            putLong(KEY_ACCESS_EXPIRES_AT, expiresAt)
            if (!refreshToken.isNullOrBlank()) {
                putString(KEY_REFRESH, refreshToken)
            }
        }
    }

    fun clearSession() {
        safeEdit(commit = true) {
            remove(KEY_ACCESS)
            remove(KEY_REFRESH)
            remove(KEY_ACCESS_EXPIRES_AT)
            remove(KEY_CONVERSATION)
        }
    }

    fun clearSavedPassword() {
        safeEdit {
            putBoolean(KEY_SAVE_PASSWORD, false)
            remove(KEY_SAVED_PASSWORD)
        }
    }

    fun rememberCredentials(email: String, password: String) {
        safeEdit(commit = true) {
            putBoolean(KEY_SAVE_PASSWORD, true)
            putString(KEY_SAVED_EMAIL, email.trim())
            putString(KEY_SAVED_PASSWORD, password)
        }
    }

    private fun <T> safeGet(block: () -> T): T? =
        try {
            block()
        } catch (t: Throwable) {
            Log.e(TAG, "prefs read failed; resetting to fallback", t)
            resetToFallback()
            try {
                block()
            } catch (t2: Throwable) {
                Log.e(TAG, "prefs read failed after fallback", t2)
                null
            }
        }

    private fun safeEdit(commit: Boolean = false, block: SharedPreferences.Editor.() -> Unit) {
        try {
            val editor = prefs.edit().apply(block)
            if (commit) editor.commit() else editor.apply()
        } catch (t: Throwable) {
            Log.e(TAG, "prefs write failed; resetting to fallback", t)
            resetToFallback()
            try {
                val editor = prefs.edit().apply(block)
                if (commit) editor.commit() else editor.apply()
            } catch (t2: Throwable) {
                Log.e(TAG, "prefs write failed after fallback", t2)
            }
        }
    }

    private fun resetToFallback() {
        synchronized(prefsLock) {
            prefsRef = plainFallback(context)
        }
    }

    companion object {
        private const val TAG = "NovaTokenStore"
        private const val PREFS_NAME = "nova_chat_secure_prefs"
        private const val FALLBACK_PREFS_NAME = "nova_chat_prefs_fallback"
        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_ACCESS_EXPIRES_AT = "access_expires_at_ms"
        private const val KEY_CONVERSATION = "conversation_id"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_INSTALL_ID = "install_id"
        private const val KEY_SAVE_PASSWORD = "save_password"
        private const val KEY_SAVED_EMAIL = "saved_email"
        private const val KEY_SAVED_PASSWORD = "saved_password"
        private const val KEY_TTS_ENABLED = "tts_enabled"
        private const val DEFAULT_ACCESS_TTL_MS = 60L * 60L * 1000L

        private fun createPrefsNeverThrow(context: Context): SharedPreferences {
            return try {
                createEncryptedPrefs(context)
            } catch (first: Throwable) {
                Log.w(TAG, "Encrypted prefs failed; recovering", first)
                runCatching { wipeEncryptedPrefs(context) }
                try {
                    createEncryptedPrefs(context)
                } catch (second: Throwable) {
                    Log.e(TAG, "Encrypted prefs recovery failed; using fallback prefs", second)
                    plainFallback(context)
                }
            }
        }

        private fun plainFallback(context: Context): SharedPreferences =
            context.getSharedPreferences(FALLBACK_PREFS_NAME, Context.MODE_PRIVATE)

        private fun createEncryptedPrefs(context: Context): SharedPreferences {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            return EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }

        private fun wipeEncryptedPrefs(context: Context) {
            runCatching { context.deleteSharedPreferences(PREFS_NAME) }
            runCatching {
                val keyStore = KeyStore.getInstance("AndroidKeyStore")
                keyStore.load(null)
                keyStore.deleteEntry(MasterKey.DEFAULT_MASTER_KEY_ALIAS)
            }
        }
    }
}
