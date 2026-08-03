package com.empower.nova.chat.data.api

import com.empower.nova.chat.data.model.ChatLink
import com.empower.nova.chat.data.model.ChatOption
import com.empower.nova.chat.data.model.ChatProvenance
import com.empower.nova.chat.data.model.SaveReportRequest
import com.empower.nova.chat.data.model.SendChatResponse
import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.JsonReader
import com.squareup.moshi.JsonWriter
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import java.io.IOException
import java.lang.reflect.Type

/**
 * Opaque NOVA pack JSON object.
 *
 * Concrete type (not `Map<String, Any?>`) so Moshi/Retrofit never try to
 * resolve platform `Object` adapters — that was the root of
 * "Unable to create converter for … SendChatResponse".
 */
data class PackPayload(
    val values: Map<String, Any?> = emptyMap(),
) {
    fun isEmpty(): Boolean = values.isEmpty()

    fun isNotEmpty(): Boolean = values.isNotEmpty()

    fun asMap(): Map<String, Any?> = values

    companion object {
        val EMPTY = PackPayload()

        fun from(map: Map<String, Any?>?): PackPayload? =
            map?.takeIf { it.isNotEmpty() }?.let { PackPayload(it) }
    }
}

/**
 * Reads/writes [PackPayload] via [JsonReader.readJsonValue] / [JsonWriter.jsonValue].
 *
 * Critical: must write with [JsonWriter] directly — returning `Map` makes Moshi look up
 * `Map<String, Object>` and fail converter creation.
 */
class PackPayloadJsonAdapter : JsonAdapter<PackPayload?>() {
    @Throws(IOException::class)
    override fun fromJson(reader: JsonReader): PackPayload? {
        return when (reader.peek()) {
            JsonReader.Token.NULL -> {
                reader.nextNull<Unit>()
                null
            }
            JsonReader.Token.BEGIN_OBJECT -> {
                val value = reader.readJsonValue()
                @Suppress("UNCHECKED_CAST")
                PackPayload((value as? Map<String, Any?>) ?: emptyMap())
            }
            else -> {
                // Tolerate unexpected shapes (array/string) without failing the whole chat reply.
                reader.skipValue()
                PackPayload.EMPTY
            }
        }
    }

    @Throws(IOException::class)
    override fun toJson(writer: JsonWriter, value: PackPayload?) {
        if (value == null) {
            writer.nullValue()
        } else {
            writer.jsonValue(value.values)
        }
    }
}

/**
 * Factory + method-adapter facade for [Moshi.Builder] registration (AppModule / tests).
 */
class PackPayloadAdapter {
    private val delegate = PackPayloadJsonAdapter()

    @com.squareup.moshi.FromJson
    @Throws(IOException::class)
    fun fromJson(reader: JsonReader): PackPayload? = delegate.fromJson(reader)

    @com.squareup.moshi.ToJson
    @Throws(IOException::class)
    fun toJson(writer: JsonWriter, value: PackPayload?) {
        delegate.toJson(writer, value)
    }

    companion object {
        fun factory(): JsonAdapter.Factory =
            JsonAdapter.Factory { type, annotations, _ ->
                if (annotations.isNotEmpty()) return@Factory null
                if (Types.getRawType(type) != PackPayload::class.java) return@Factory null
                PackPayloadJsonAdapter().nullSafe()
            }
    }
}

/**
 * Hand-built [SendChatResponse] adapter that wires [PackPayloadJsonAdapter] directly.
 *
 * Registered first in AppModule so Retrofit converter creation never depends on
 * codegen discovering PackPayload via Moshi factory order alone.
 *
 * Named *Manual* to avoid clashing with KSP-generated `SendChatResponseJsonAdapter`.
 */
class SendChatResponseManualAdapter(
    moshi: Moshi,
) : JsonAdapter<SendChatResponse>() {
    private val options: JsonReader.Options = JsonReader.Options.of(
        "ok", "answer", "links", "toolsUsed", "conversationId", "periodLabel",
        "provenance", "pack", "canSaveReport", "options", "clarifyKind",
        "error", "errorKind", "message",
    )

    private val booleanAdapter: JsonAdapter<Boolean> =
        moshi.adapter(Boolean::class.java, emptySet(), "ok")
    private val nullableStringAdapter: JsonAdapter<String?> =
        moshi.adapter(String::class.java, emptySet(), "answer")
    private val listOfChatLinkAdapter: JsonAdapter<List<ChatLink>> =
        moshi.adapter(Types.newParameterizedType(List::class.java, ChatLink::class.java), emptySet(), "links")
    private val listOfStringAdapter: JsonAdapter<List<String>> =
        moshi.adapter(Types.newParameterizedType(List::class.java, String::class.java), emptySet(), "toolsUsed")
    private val nullableProvenanceAdapter: JsonAdapter<ChatProvenance?> =
        moshi.adapter(ChatProvenance::class.java, emptySet(), "provenance")
    private val packAdapter: JsonAdapter<PackPayload?> = PackPayloadJsonAdapter().nullSafe()
    private val listOfChatOptionAdapter: JsonAdapter<List<ChatOption>> =
        moshi.adapter(Types.newParameterizedType(List::class.java, ChatOption::class.java), emptySet(), "options")

    override fun fromJson(reader: JsonReader): SendChatResponse {
        var ok = false
        var answer: String? = null
        var links: List<ChatLink> = emptyList()
        var toolsUsed: List<String> = emptyList()
        var conversationId: String? = null
        var periodLabel: String? = null
        var provenance: ChatProvenance? = null
        var pack: PackPayload? = null
        var canSaveReport = false
        var optionsList: List<ChatOption> = emptyList()
        var clarifyKind: String? = null
        var error: String? = null
        var errorKind: String? = null
        var message: String? = null

        reader.beginObject()
        while (reader.hasNext()) {
            when (reader.selectName(options)) {
                0 -> ok = booleanAdapter.fromJson(reader) ?: false
                1 -> answer = nullableStringAdapter.fromJson(reader)
                2 -> links = listOfChatLinkAdapter.fromJson(reader) ?: emptyList()
                3 -> toolsUsed = listOfStringAdapter.fromJson(reader) ?: emptyList()
                4 -> conversationId = nullableStringAdapter.fromJson(reader)
                5 -> periodLabel = nullableStringAdapter.fromJson(reader)
                6 -> provenance = nullableProvenanceAdapter.fromJson(reader)
                7 -> pack = packAdapter.fromJson(reader)
                8 -> canSaveReport = booleanAdapter.fromJson(reader) ?: false
                9 -> optionsList = listOfChatOptionAdapter.fromJson(reader) ?: emptyList()
                10 -> clarifyKind = nullableStringAdapter.fromJson(reader)
                11 -> error = nullableStringAdapter.fromJson(reader)
                12 -> errorKind = nullableStringAdapter.fromJson(reader)
                13 -> message = nullableStringAdapter.fromJson(reader)
                -1 -> {
                    reader.skipName()
                    reader.skipValue()
                }
            }
        }
        reader.endObject()
        return SendChatResponse(
            ok = ok,
            answer = answer,
            links = links,
            toolsUsed = toolsUsed,
            conversationId = conversationId,
            periodLabel = periodLabel,
            provenance = provenance,
            pack = pack,
            canSaveReport = canSaveReport,
            options = optionsList,
            clarifyKind = clarifyKind,
            error = error,
            errorKind = errorKind,
            message = message,
        )
    }

    override fun toJson(writer: JsonWriter, value: SendChatResponse?) {
        if (value == null) {
            writer.nullValue()
            return
        }
        writer.beginObject()
        writer.name("ok"); booleanAdapter.toJson(writer, value.ok)
        writer.name("answer"); nullableStringAdapter.toJson(writer, value.answer)
        writer.name("links"); listOfChatLinkAdapter.toJson(writer, value.links)
        writer.name("toolsUsed"); listOfStringAdapter.toJson(writer, value.toolsUsed)
        writer.name("conversationId"); nullableStringAdapter.toJson(writer, value.conversationId)
        writer.name("periodLabel"); nullableStringAdapter.toJson(writer, value.periodLabel)
        writer.name("provenance"); nullableProvenanceAdapter.toJson(writer, value.provenance)
        writer.name("pack"); packAdapter.toJson(writer, value.pack)
        writer.name("canSaveReport"); booleanAdapter.toJson(writer, value.canSaveReport)
        writer.name("options"); listOfChatOptionAdapter.toJson(writer, value.options)
        writer.name("clarifyKind"); nullableStringAdapter.toJson(writer, value.clarifyKind)
        writer.name("error"); nullableStringAdapter.toJson(writer, value.error)
        writer.name("errorKind"); nullableStringAdapter.toJson(writer, value.errorKind)
        writer.name("message"); nullableStringAdapter.toJson(writer, value.message)
        writer.endObject()
    }

    companion object {
        fun factory(): JsonAdapter.Factory =
            JsonAdapter.Factory { type, annotations, moshi ->
                if (annotations.isNotEmpty()) return@Factory null
                when (Types.getRawType(type)) {
                    SendChatResponse::class.java -> SendChatResponseManualAdapter(moshi).nullSafe()
                    SaveReportRequest::class.java -> SaveReportRequestManualAdapter(moshi).nullSafe()
                    else -> null
                }
            }
    }
}

/** Hand-built so [PackPayload] encoding never goes through Map/Object codegen. */
class SaveReportRequestManualAdapter(
    moshi: Moshi,
) : JsonAdapter<SaveReportRequest>() {
    private val options: JsonReader.Options = JsonReader.Options.of("title", "narrative", "pack")
    private val stringAdapter: JsonAdapter<String> =
        moshi.adapter(String::class.java, emptySet(), "title")
    private val packAdapter: JsonAdapter<PackPayload?> = PackPayloadJsonAdapter().nullSafe()

    override fun fromJson(reader: JsonReader): SaveReportRequest {
        var title = ""
        var narrative = ""
        var pack = PackPayload.EMPTY
        reader.beginObject()
        while (reader.hasNext()) {
            when (reader.selectName(options)) {
                0 -> title = stringAdapter.fromJson(reader) ?: ""
                1 -> narrative = stringAdapter.fromJson(reader) ?: ""
                2 -> pack = packAdapter.fromJson(reader) ?: PackPayload.EMPTY
                -1 -> {
                    reader.skipName()
                    reader.skipValue()
                }
            }
        }
        reader.endObject()
        return SaveReportRequest(title = title, narrative = narrative, pack = pack)
    }

    override fun toJson(writer: JsonWriter, value: SaveReportRequest?) {
        if (value == null) {
            writer.nullValue()
            return
        }
        writer.beginObject()
        writer.name("title"); stringAdapter.toJson(writer, value.title)
        writer.name("narrative"); stringAdapter.toJson(writer, value.narrative)
        writer.name("pack"); packAdapter.toJson(writer, value.pack)
        writer.endObject()
    }
}

/**
 * Belt-and-suspenders: allow Moshi to resolve `Any` / `Object`
 * (needed if any model still uses `Map<String, Any?>`).
 */
object AnyJsonAdapter {
    fun factory(): JsonAdapter.Factory =
        JsonAdapter.Factory { type, annotations, _ ->
            if (annotations.isNotEmpty()) return@Factory null
            val raw: Type = Types.getRawType(type)
            if (raw != Any::class.java && raw != Object::class.java) return@Factory null
            object : JsonAdapter<Any?>() {
                override fun fromJson(reader: JsonReader): Any? = reader.readJsonValue()

                override fun toJson(writer: JsonWriter, value: Any?) {
                    writer.jsonValue(value)
                }
            }
        }
}
