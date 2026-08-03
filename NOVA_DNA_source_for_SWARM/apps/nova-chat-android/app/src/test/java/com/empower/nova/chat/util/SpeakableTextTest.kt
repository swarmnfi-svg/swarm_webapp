package com.empower.nova.chat.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SpeakableTextTest {
    @Test
    fun stripsMarkdownLinksAndEmphasis() {
        val raw = """
            ## Receivables
            You have **₹1.2L** outstanding for [Acme](/customers/1).
            - Invoice `INV-1`
            - Invoice INV-2
        """.trimIndent()
        val plain = SpeakableText.fromMarkdown(raw)
        assertTrue(plain.contains("Receivables"))
        assertTrue(plain.contains("₹1.2L"))
        assertTrue(plain.contains("Acme"))
        assertTrue(!plain.contains("**"))
        assertTrue(!plain.contains("/customers/1"))
        assertTrue(!plain.contains("`"))
        assertTrue(!plain.contains("##"))
    }

    @Test
    fun truncatesLongAnswersAtSentenceBoundary() {
        val sentence = "This is a complete sentence. "
        val raw = sentence.repeat(200)
        val plain = SpeakableText.fromMarkdown(raw, maxChars = 200)
        assertTrue(plain.length <= 200)
        assertTrue(plain.isNotEmpty())
        // Prefer a sentence end when one falls in the latter half of the window.
        assertTrue(plain.contains("complete sentence"))
    }

    @Test
    fun emptyInputStaysEmpty() {
        assertEquals("", SpeakableText.fromMarkdown("   "))
    }
}
