package com.empower.nova.chat.data.model

import com.empower.nova.chat.data.api.AnyJsonAdapter
import com.empower.nova.chat.data.api.NovaApiService
import com.empower.nova.chat.data.api.PackPayload
import com.empower.nova.chat.data.api.PackPayloadAdapter
import com.empower.nova.chat.data.api.SendChatResponseManualAdapter
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.ResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import retrofit2.Converter
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

/**
 * Guards the regression: Moshi/Retrofit must build a converter for [SendChatResponse]
 * including nested pack objects (receivables / report-shaped payloads).
 */
class SendChatResponseMoshiTest {
    private val moshi: Moshi =
        Moshi.Builder()
            .add(SendChatResponseManualAdapter.factory())
            .add(AnyJsonAdapter.factory())
            .add(PackPayloadAdapter.factory())
            .add(PackPayloadAdapter())
            .addLast(KotlinJsonAdapterFactory())
            .build()

    private val adapter = moshi.adapter(SendChatResponse::class.java)

    @Test
    fun adapterExists_forSendChatResponse() {
        assertNotNull(adapter)
    }

    @Test
    fun retrofitConverterExists_forSendChatResponse() {
        val retrofit =
            Retrofit.Builder()
                .baseUrl("https://example.test/")
                .addConverterFactory(MoshiConverterFactory.create(moshi))
                .build()
        val converter: Converter<ResponseBody, *>? =
            retrofit.responseBodyConverter<SendChatResponse>(
                SendChatResponse::class.java,
                emptyArray(),
            )
        assertNotNull("Retrofit must create a converter for SendChatResponse", converter)
    }

    @Test
    fun retrofitService_sendChat_doesNotThrowOnCreate() {
        val retrofit =
            Retrofit.Builder()
                .baseUrl("https://example.test/")
                .addConverterFactory(MoshiConverterFactory.create(moshi))
                .build()
        val service = retrofit.create(NovaApiService::class.java)
        assertNotNull(service)
        val method = NovaApiService::class.java.methods.first { it.name == "sendChat" }
        val converter =
            retrofit.responseBodyConverter<SendChatResponse>(
                SendChatResponse::class.java,
                method.annotations,
            )
        assertNotNull("sendChat response converter must exist", converter)
    }

    @Test
    fun fromJson_simpleHiReply_withoutPack() {
        val json =
            """
            {
              "ok": true,
              "answer": "Hi — how can I help?",
              "links": [],
              "toolsUsed": ["greeting"],
              "conversationId": "conv-1",
              "canSaveReport": false,
              "options": []
            }
            """.trimIndent()

        val parsed = adapter.fromJson(json)!!
        assertTrue(parsed.ok)
        assertEquals("Hi — how can I help?", parsed.answer)
        assertNull(parsed.pack)
        assertEquals(listOf("greeting"), parsed.toolsUsed)
    }

    @Test
    fun fromJson_receivablesStylePayload_withNestedPack() {
        val json =
            """
            {
              "ok": true,
              "answer": "Receivables summary for this month…",
              "links": [{"title": "AR", "href": "/receivables"}],
              "toolsUsed": ["receivables_report", "presentation:table"],
              "conversationId": "conv-recv-1",
              "periodLabel": "Jul 2026",
              "provenance": {
                "period": "2026-07",
                "sources": ["ar_open"],
                "freshness": "live",
                "trustWarnings": []
              },
              "pack": {
                "packId": "receivables.v1",
                "packVersion": 1,
                "totals": {"open": 125000.5, "overdue": 42000},
                "rows": [
                  {"customer": "Acme", "amount": 10000, "meta": {"days": 45}},
                  {"customer": "Beta", "amount": null, "tags": ["watch"]}
                ],
                "flags": {"canExport": true, "partial": false}
              },
              "canSaveReport": true,
              "options": [
                {"n": 1, "id": "deeper", "label": "Ask deeper", "reply": "elaborate"}
              ],
              "clarifyKind": null,
              "unknownFutureField": {"ignored": true}
            }
            """.trimIndent()

        val parsed = adapter.fromJson(json)!!
        assertTrue(parsed.ok)
        assertTrue(parsed.answer!!.contains("Receivables"))
        assertEquals(1, parsed.links.size)
        assertEquals("/receivables", parsed.links[0].href)
        assertTrue(parsed.canSaveReport)
        assertNotNull(parsed.pack)
        assertTrue(parsed.pack!!.isNotEmpty())
        assertEquals("receivables.v1", parsed.pack!!.values["packId"])
        @Suppress("UNCHECKED_CAST")
        val totals = parsed.pack!!.values["totals"] as Map<String, Any?>
        assertEquals(125000.5, totals["open"])
        assertEquals(1, parsed.options.size)
        assertEquals("Ask deeper", parsed.options[0].label)
        assertEquals("Jul 2026", parsed.periodLabel)
    }

    @Test
    fun fromJson_nullPack_andEmptyPack() {
        val nullPack =
            adapter.fromJson(
                """{"ok":true,"answer":"x","pack":null,"links":[],"toolsUsed":[],"options":[]}""",
            )!!
        assertNull(nullPack.pack)

        val emptyPack =
            adapter.fromJson(
                """{"ok":true,"answer":"x","pack":{},"links":[],"toolsUsed":[],"options":[]}""",
            )!!
        assertNotNull(emptyPack.pack)
        assertTrue(emptyPack.pack!!.isEmpty())
    }

    @Test
    fun roundTrip_saveReportRequest_pack() {
        val reqAdapter = moshi.adapter(SaveReportRequest::class.java)
        val original =
            SaveReportRequest(
                title = "NOVA report",
                narrative = "Summary",
                pack = PackPayload(
                    mapOf(
                        "packId" to "receivables.v1",
                        "nested" to mapOf("a" to 1, "b" to listOf("x", "y")),
                    ),
                ),
            )
        val encoded = reqAdapter.toJson(original)
        val decoded = reqAdapter.fromJson(encoded)!!
        assertEquals("NOVA report", decoded.title)
        assertEquals("receivables.v1", decoded.pack.values["packId"])
        assertFalse(decoded.pack.isEmpty())
    }

    /**
     * Root cause of "Unable to create converter for … SendChatResponse":
     * Moshi codegen for `Map<String, Any?>` has no adapter for platform `Object`.
     */
    @Test
    fun mapPackField_cannotCreateMoshiAdapter_withoutAnyFactory() {
        val brokenMoshi =
            Moshi.Builder()
                .addLast(KotlinJsonAdapterFactory())
                .build()
        try {
            brokenMoshi.adapter(LegacySendChatResponseWithMapPack::class.java)
            // Some Moshi versions defer failure until first use — force fromJson.
            brokenMoshi.adapter(LegacySendChatResponseWithMapPack::class.java)
                .fromJson("""{"ok":true,"pack":{"a":1}}""")
            fail("Expected Map<String, Any?> pack field to break Moshi without Any adapter")
        } catch (e: Throwable) {
            val msg = generateSequence(e) { it.cause }.mapNotNull { it.message }.joinToString(" ")
            assertTrue(
                "Expected Object/platform-type failure, got: $msg",
                msg.contains("Object", ignoreCase = true) ||
                    msg.contains("Platform", ignoreCase = true) ||
                    msg.contains("JsonAdapter", ignoreCase = true) ||
                    msg.contains("adapter", ignoreCase = true),
            )
        }
    }
}

@JsonClass(generateAdapter = true)
data class LegacySendChatResponseWithMapPack(
    val ok: Boolean = false,
    val answer: String? = null,
    val pack: Map<String, Any?>? = null,
)
