package com.empower.nova.chat.data.api

import com.empower.nova.chat.data.model.ClientApiErrorBody
import com.squareup.moshi.JsonDataException
import com.squareup.moshi.JsonEncodingException
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import retrofit2.HttpException
import java.io.IOException

private val errorMoshi: Moshi = Moshi.Builder()
    .addLast(KotlinJsonAdapterFactory())
    .build()

fun apiErrorMessage(error: Throwable, fallback: String): String =
    when (error) {
        is HttpException -> {
            val body = error.response()?.errorBody()?.string()
            val parsed = if (!body.isNullOrBlank()) {
                runCatching {
                    errorMoshi.adapter(ClientApiErrorBody::class.java).fromJson(body)
                }.getOrNull()
            } else {
                null
            }
            parsed?.message?.takeIf { it.isNotBlank() }
                ?: parsed?.error?.takeIf { it.isNotBlank() }
                ?: "Request failed (${error.code()})"
        }
        is IOException -> "Cannot reach server. Check your connection and try again."
        else -> userFacingClientError(error, fallback)
    }

/**
 * Never surface Moshi/Retrofit converter stack traces to the user.
 */
internal fun userFacingClientError(error: Throwable, fallback: String): String {
    val chain = generateSequence(error) { it.cause }.take(8).toList()
    val raw = chain.mapNotNull { it.message }.firstOrNull { it.isNotBlank() }.orEmpty()
    val lowerJoined = chain.mapNotNull { it.message }.joinToString("\n").lowercase()
    if (
        chain.any {
            it is IllegalArgumentException ||
                it is JsonDataException ||
                it is JsonEncodingException
        } ||
        lowerJoined.contains("unable to create converter") ||
        lowerJoined.contains("jsonadapter") ||
        lowerJoined.contains("moshi") ||
        lowerJoined.contains("expected begin_") ||
        lowerJoined.contains("platform type")
    ) {
        return fallback
    }
    return raw.ifBlank { fallback }.let { msg ->
        // Cap length so toast/dialog stay readable.
        if (msg.length > 160) fallback else msg
    }
}
