package com.empower.nova.chat.util

/**
 * Strip markdown / link chrome so Android [android.speech.tts.TextToSpeech] speaks
 * plain prose from NOVA assistant replies.
 */
object SpeakableText {
    private val linkMarkdown = Regex("""\[([^\]]+)\]\([^)]+\)""")
    private val imageMarkdown = Regex("""!\[[^\]]*]\([^)]+\)""")
    private val headingMarkers = Regex("""^#{1,6}\s+""", RegexOption.MULTILINE)
    private val boldItalic = Regex("""(\*\*|__|\*|_|~~|`)""")
    private val codeFence = Regex("""```[\s\S]*?```""")
    private val inlineCode = Regex("""`([^`]+)`""")
    private val bulletPrefix = Regex("""^\s*[-*+]\s+""", RegexOption.MULTILINE)
    private val numberedPrefix = Regex("""^\s*\d+\.\s+""", RegexOption.MULTILINE)
    private val multiSpace = Regex("""[ \t]{2,}""")
    private val multiNewline = Regex("""\n{3,}""")

    fun fromMarkdown(raw: String, maxChars: Int = 2_500): String {
        var text = raw.trim()
        if (text.isEmpty()) return ""
        text = codeFence.replace(text, " ")
        text = imageMarkdown.replace(text, " ")
        text = linkMarkdown.replace(text, "$1")
        text = inlineCode.replace(text, "$1")
        text = headingMarkers.replace(text, "")
        text = bulletPrefix.replace(text, "")
        text = numberedPrefix.replace(text, "")
        text = boldItalic.replace(text, "")
        text = text.replace('\u00a0', ' ')
        text = multiSpace.replace(text, " ")
        text = multiNewline.replace(text, "\n\n")
        text = text.trim()
        if (text.length <= maxChars) return text
        val cut = text.substring(0, maxChars)
        val lastBreak = maxOf(cut.lastIndexOf('.'), cut.lastIndexOf('\n'), cut.lastIndexOf(' '))
        return if (lastBreak > maxChars / 2) cut.substring(0, lastBreak + 1).trim() else cut.trim()
    }
}
