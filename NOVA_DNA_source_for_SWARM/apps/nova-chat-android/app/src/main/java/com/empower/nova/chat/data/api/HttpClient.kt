package com.empower.nova.chat.data.api

import com.empower.nova.chat.BuildConfig
import com.empower.nova.chat.data.TokenStore
import com.empower.nova.chat.data.model.TokenRefreshRequest
import com.empower.nova.chat.data.model.TokenRefreshResponse
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenStore: TokenStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val path = request.url.encodedPath
        val skipAuth =
            path.endsWith("/auth/login") ||
                path.endsWith("/auth/token") ||
                path.endsWith("/auth/mfa/verify")
        val token = tokenStore.accessToken
        val authenticated = if (!token.isNullOrBlank() && !skipAuth) {
            request.newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        } else {
            request
        }
        return chain.proceed(authenticated)
    }
}

/**
 * On 401, refresh access token via refresh_token grant and retry once.
 *
 * Clears session only on definitive auth failure (invalid/expired refresh).
 * Transient network / 5xx errors leave the session intact so the user stays signed in.
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    private val tokenStore: TokenStore,
) : Authenticator {
    private val refreshLock = Any()
    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()
    private val refreshAdapter = moshi.adapter(TokenRefreshResponse::class.java)

    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null
        val path = response.request.url.encodedPath
        if (
            path.endsWith("/auth/login") ||
            path.endsWith("/auth/token") ||
            path.endsWith("/auth/mfa/verify")
        ) {
            return null
        }

        val refresh = tokenStore.refreshToken?.trim().orEmpty()
        if (refresh.isEmpty()) {
            // Access token alone cannot be renewed — definitive session end.
            tokenStore.clearSession()
            return null
        }

        synchronized(refreshLock) {
            // Another thread may have refreshed already.
            val currentAccess = tokenStore.accessToken
            val requestAuth = response.request.header("Authorization")
            if (
                !currentAccess.isNullOrBlank() &&
                requestAuth != "Bearer $currentAccess"
            ) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer $currentAccess")
                    .build()
            }

            val bodyJson = moshi.adapter(TokenRefreshRequest::class.java)
                .toJson(TokenRefreshRequest(refreshToken = refresh))
            val refreshRequest = Request.Builder()
                .url("${BuildConfig.API_BASE_URL.trimEnd('/')}/api/client/v1/auth/token")
                .post(bodyJson.toRequestBody("application/json".toMediaType()))
                .build()

            val client = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build()

            val refreshResponse = try {
                client.newCall(refreshRequest).execute()
            } catch (_: IOException) {
                // Network blip — keep session; caller can retry later.
                return null
            }

            refreshResponse.use { result ->
                if (!result.isSuccessful) {
                    if (isDefinitiveAuthFailure(result.code)) {
                        tokenStore.clearSession()
                    }
                    return null
                }
                val payload = result.body?.string().orEmpty()
                val parsed = runCatching { refreshAdapter.fromJson(payload) }.getOrNull()
                val newAccess = parsed?.accessToken
                val newRefresh = parsed?.refreshToken
                if (parsed?.ok != true || newAccess.isNullOrBlank()) {
                    // Malformed success body — treat as auth failure only if server said so.
                    if (parsed?.ok == false) {
                        tokenStore.clearSession()
                    }
                    return null
                }
                tokenStore.saveTokens(
                    accessToken = newAccess,
                    refreshToken = if (!newRefresh.isNullOrBlank()) newRefresh else refresh,
                    expiresInSeconds = parsed.expiresIn,
                )
                return response.request.newBuilder()
                    .header("Authorization", "Bearer $newAccess")
                    .build()
            }
        }
    }

    private fun isDefinitiveAuthFailure(code: Int): Boolean =
        code == 400 || code == 401 || code == 403

    private fun responseCount(response: Response): Int {
        var result = 1
        var prior = response.priorResponse
        while (prior != null) {
            result++
            prior = prior.priorResponse
        }
        return result
    }
}

@Singleton
class OkHttpClientProvider @Inject constructor(
    authInterceptor: AuthInterceptor,
    tokenAuthenticator: TokenAuthenticator,
) {
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .addInterceptor(authInterceptor)
        .authenticator(tokenAuthenticator)
        .apply {
            if (BuildConfig.DEBUG) {
                addInterceptor(
                    HttpLoggingInterceptor().apply {
                        level = HttpLoggingInterceptor.Level.BASIC
                    },
                )
            }
        }
        .build()
}
