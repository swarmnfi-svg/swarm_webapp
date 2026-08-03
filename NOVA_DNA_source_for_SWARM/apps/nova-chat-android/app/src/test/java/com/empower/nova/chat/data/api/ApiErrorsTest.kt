package com.empower.nova.chat.data.api

import org.junit.Assert.assertEquals
import org.junit.Test

class ApiErrorsTest {
    @Test
    fun hidesMoshiConverterNoise() {
        val err = IllegalArgumentException(
            "Unable to create converter for class com.empower.nova.chat.data.model.SendChatResponse for method NovaApiService.sendChat",
        )
        assertEquals(
            "NOVA could not answer",
            userFacingClientError(err, "NOVA could not answer"),
        )
    }

    @Test
    fun hidesNestedConverterCause() {
        val root = IllegalArgumentException(
            "Unable to create converter for class com.empower.nova.chat.data.model.SendChatResponse for method NovaApiService.sendChat",
        )
        val wrapped = Exception("Send failed", Exception("wrapper", root))
        assertEquals(
            "NOVA could not answer",
            userFacingClientError(wrapped, "NOVA could not answer"),
        )
    }

    @Test
    fun keepsShortBusinessMessages() {
        assertEquals(
            "Permission denied",
            userFacingClientError(Exception("Permission denied"), "fallback"),
        )
    }
}
