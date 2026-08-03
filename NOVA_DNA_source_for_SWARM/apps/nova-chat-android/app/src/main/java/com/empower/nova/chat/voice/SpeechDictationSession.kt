package com.empower.nova.chat.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

/**
 * Hold-to-talk + short-tap-to-toggle speech dictation.
 *
 * Fixes common Android 11+ failures:
 * - [SpeechRecognizer.stopListening] before [RecognitionListener.onReadyForSpeech]
 *   (ERROR_CLIENT / silent no-op)
 * - recognizer busy after a prior cancel
 * - missing UI feedback until ready
 */
class SpeechDictationSession(
    private val context: Context,
    private val onListeningChanged: (Boolean) -> Unit,
    private val onTranscript: (String) -> Unit,
    private val onErrorMessage: (String) -> Unit,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var readyForSpeech = false
    private var stopWhenReady = false
    private var userWantsResults = false
    private var sessionActive = false
    private var destroyed = false
    private var pressStartedAtMs = 0L

    val isSessionActive: Boolean get() = sessionActive

    fun startFromPress(): Boolean {
        ensureMainThread()
        if (destroyed) return false
        if (sessionActive) {
            // Second tap while listening → stop (tap-to-toggle).
            stopFromRelease(forceStop = true)
            return false
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            onErrorMessage("Speech recognition not available on this device")
            return false
        }
        pressStartedAtMs = SystemClock.elapsedRealtime()
        readyForSpeech = false
        stopWhenReady = false
        userWantsResults = true
        sessionActive = true
        onListeningChanged(true)

        val rec = obtainRecognizer()
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        }
        return try {
            rec.startListening(intent)
            true
        } catch (t: Throwable) {
            resetSession()
            onErrorMessage("Could not start voice input")
            false
        }
    }

    /**
     * @param forceStop always end the session (toolbar / second tap).
     * Otherwise: short tap leaves mic open until next tap; long hold stops on release.
     */
    fun stopFromRelease(forceStop: Boolean = false) {
        ensureMainThread()
        if (!sessionActive) return
        val heldMs = SystemClock.elapsedRealtime() - pressStartedAtMs
        val treatAsHold = forceStop || heldMs >= HOLD_THRESHOLD_MS
        if (!treatAsHold) {
            // Short tap: keep listening until the user taps again.
            return
        }
        userWantsResults = true
        if (readyForSpeech) {
            runCatching { recognizer?.stopListening() }
        } else {
            stopWhenReady = true
            mainHandler.postDelayed({
                if (sessionActive && !readyForSpeech) {
                    // Never became ready — cancel quietly and recreate next time.
                    cancelQuietly()
                    onErrorMessage("Mic did not start — tap and speak, or hold longer")
                }
            }, READY_TIMEOUT_MS)
        }
    }

    fun destroy() {
        ensureMainThread()
        destroyed = true
        mainHandler.removeCallbacksAndMessages(null)
        runCatching { recognizer?.cancel() }
        runCatching { recognizer?.destroy() }
        recognizer = null
        resetSession(notify = false)
    }

    private fun obtainRecognizer(): SpeechRecognizer {
        recognizer?.let { return it }
        val created = SpeechRecognizer.createSpeechRecognizer(context.applicationContext)
        created.setRecognitionListener(listener)
        recognizer = created
        return created
    }

    private fun recreateRecognizer() {
        runCatching { recognizer?.destroy() }
        recognizer = null
    }

    private fun cancelQuietly() {
        runCatching { recognizer?.cancel() }
        recreateRecognizer()
        resetSession()
    }

    private fun resetSession(notify: Boolean = true) {
        sessionActive = false
        readyForSpeech = false
        stopWhenReady = false
        userWantsResults = false
        if (notify) onListeningChanged(false)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            readyForSpeech = true
            if (stopWhenReady) {
                stopWhenReady = false
                runCatching { recognizer?.stopListening() }
            }
        }

        override fun onBeginningOfSpeech() = Unit
        override fun onRmsChanged(rmsdB: Float) = Unit
        override fun onBufferReceived(buffer: ByteArray?) = Unit

        override fun onEndOfSpeech() {
            // Keep sessionActive until results/error so UI stays honest.
        }

        override fun onError(error: Int) {
            val wasActive = sessionActive
            val wanted = userWantsResults
            resetSession()
            when (error) {
                SpeechRecognizer.ERROR_CLIENT,
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
                -> {
                    // Common when releasing before ready or empty utterance — recreate.
                    recreateRecognizer()
                    if (wasActive && wanted) {
                        // Soft hint only when user clearly tried.
                        if (error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                            onErrorMessage("Didn't catch that — try again")
                        }
                    }
                }
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> {
                    recreateRecognizer()
                    onErrorMessage("Mic busy — try again")
                }
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                    onErrorMessage("Microphone permission needed for voice")
                SpeechRecognizer.ERROR_NETWORK,
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
                -> onErrorMessage("Voice input needs a network connection")
                SpeechRecognizer.ERROR_NO_MATCH ->
                    onErrorMessage("Didn't catch that — try again")
                SpeechRecognizer.ERROR_SERVER ->
                    onErrorMessage("Speech service error — try again")
                else -> {
                    recreateRecognizer()
                    if (wasActive) onErrorMessage("Voice input failed — try again")
                }
            }
        }

        override fun onResults(results: Bundle?) {
            val text = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                .orEmpty()
                .trim()
            val wanted = userWantsResults
            resetSession()
            if (text.isNotEmpty()) {
                onTranscript(text)
            } else if (wanted) {
                onErrorMessage("Didn't catch that — try again")
            }
        }

        override fun onPartialResults(partialResults: Bundle?) = Unit

        override fun onEvent(eventType: Int, params: Bundle?) = Unit
    }

    private fun ensureMainThread() {
        check(Looper.myLooper() == Looper.getMainLooper()) {
            "SpeechDictationSession must run on the main thread"
        }
    }

    companion object {
        /** Presses shorter than this keep listening (tap-to-toggle). */
        const val HOLD_THRESHOLD_MS = 350L
        private const val READY_TIMEOUT_MS = 2_500L
    }
}
