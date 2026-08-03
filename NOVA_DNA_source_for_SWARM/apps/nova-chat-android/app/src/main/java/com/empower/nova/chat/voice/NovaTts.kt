package com.empower.nova.chat.voice

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import com.empower.nova.chat.util.SpeakableText
import java.util.Locale
import java.util.UUID

/**
 * Speaks NOVA assistant replies via the device TTS engine.
 * Init is async — [speak] queues until ready.
 */
class NovaTts(
    context: Context,
    private val onSpeakingChanged: (Boolean) -> Unit = {},
    private val onInitFailed: (String) -> Unit = {},
) {
    private val appContext = context.applicationContext
    private var tts: TextToSpeech? = null
    private var ready = false
    private var pending: String? = null
    private var speaking = false
    private var destroyed = false

    init {
        tts = TextToSpeech(appContext) { status ->
            if (destroyed) return@TextToSpeech
            if (status != TextToSpeech.SUCCESS) {
                ready = false
                onInitFailed("Text-to-speech is not available on this device")
                return@TextToSpeech
            }
            val engine = tts ?: return@TextToSpeech
            val langResult = engine.setLanguage(Locale.getDefault()).let { code ->
                if (code == TextToSpeech.LANG_MISSING_DATA || code == TextToSpeech.LANG_NOT_SUPPORTED) {
                    engine.setLanguage(Locale.US)
                } else {
                    code
                }
            }
            if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
                ready = false
                onInitFailed("No TTS voice for this language")
                return@TextToSpeech
            }
            engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    speaking = true
                    onSpeakingChanged(true)
                }

                override fun onDone(utteranceId: String?) {
                    speaking = false
                    onSpeakingChanged(false)
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    speaking = false
                    onSpeakingChanged(false)
                }

                override fun onError(utteranceId: String?, errorCode: Int) {
                    speaking = false
                    onSpeakingChanged(false)
                }
            })
            ready = true
            pending?.let { queued ->
                pending = null
                speakInternal(queued)
            }
        }
    }

    fun speakMarkdown(raw: String) {
        val plain = SpeakableText.fromMarkdown(raw)
        if (plain.isBlank()) return
        if (!ready) {
            pending = plain
            return
        }
        speakInternal(plain)
    }

    fun stop() {
        runCatching { tts?.stop() }
        speaking = false
        pending = null
        onSpeakingChanged(false)
    }

    fun destroy() {
        destroyed = true
        pending = null
        runCatching { tts?.stop() }
        runCatching { tts?.shutdown() }
        tts = null
        ready = false
        speaking = false
        onSpeakingChanged(false)
    }

    private fun speakInternal(plain: String) {
        val engine = tts ?: return
        runCatching { engine.stop() }
        val id = UUID.randomUUID().toString()
        val params = Bundle()
        val result = engine.speak(plain, TextToSpeech.QUEUE_FLUSH, params, id)
        if (result != TextToSpeech.SUCCESS) {
            Log.w(TAG, "speak() failed code=$result")
            onInitFailed("Could not speak reply")
            onSpeakingChanged(false)
        }
    }

    companion object {
        private const val TAG = "NovaTts"
    }
}
