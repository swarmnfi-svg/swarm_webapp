package com.empower.nova.chat

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Emulator smoke: login → NOVA chat → send "hi" and "receivables report"
 * without Moshi converter failures.
 *
 * Requires mock API on host :3000. Build with
 * `-PnovaDebugLocalApi=true` (or `-PnovaApiBaseUrl=http://10.0.2.2:3000`).
 */
@RunWith(AndroidJUnit4::class)
class NovaChatFlowTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun login_sendHi_andReceivablesReport_withoutConverterError() {
        composeRule.waitForIdle()

        if (runCatching { composeRule.onNodeWithTag("login_email").assertExists() }.isSuccess) {
            composeRule.onNodeWithTag("login_email").performTextInput("admin@biopower.co.in")
            composeRule.onNodeWithTag("login_password").performTextInput("ChangeMe@123")
            composeRule.onNodeWithTag("login_submit").performClick()
        }

        composeRule.waitUntil(timeoutMillis = 25_000) {
            runCatching {
                composeRule.onNodeWithText("Ask anything").assertIsDisplayed()
                true
            }.getOrDefault(false)
        }

        composeRule.onNodeWithText("Ask anything").performClick()

        composeRule.waitUntil(timeoutMillis = 15_000) {
            runCatching {
                composeRule.onNodeWithTag("chat_composer").assertIsDisplayed()
                true
            }.getOrDefault(false)
        }

        // --- hi ---
        composeRule.onNodeWithTag("chat_composer").performTextInput("hi")
        composeRule.onNodeWithTag("chat_send").performClick()

        composeRule.waitUntil(timeoutMillis = 20_000) {
            runCatching {
                composeRule.onNodeWithText("You asked: hi").assertIsDisplayed()
                true
            }.getOrDefault(false)
        }
        assertNoConverterError()

        // --- receivables report (nested pack) ---
        composeRule.onNodeWithTag("chat_composer").performTextInput("receivables report")
        composeRule.onNodeWithTag("chat_send").performClick()

        composeRule.waitUntil(timeoutMillis = 25_000) {
            runCatching {
                composeRule.onNodeWithText("Receivables summary", substring = true).assertIsDisplayed()
                true
            }.getOrDefault(false)
        }
        assertNoConverterError()
    }

    private fun assertNoConverterError() {
        val converterNoise =
            runCatching {
                composeRule.onNodeWithText("Unable to create converter", substring = true)
                    .assertIsDisplayed()
                true
            }.getOrDefault(false) ||
                runCatching {
                    composeRule.onNodeWithText("SendChatResponse", substring = true)
                        .assertIsDisplayed()
                    true
                }.getOrDefault(false) ||
                runCatching {
                    composeRule.onNodeWithText("JsonAdapter", substring = true)
                        .assertIsDisplayed()
                    true
                }.getOrDefault(false)
        check(!converterNoise) { "Moshi/Retrofit converter error still shown in UI" }
    }
}
