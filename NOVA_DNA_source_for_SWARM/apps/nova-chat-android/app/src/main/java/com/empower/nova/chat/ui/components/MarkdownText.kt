package com.empower.nova.chat.ui.components

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow

/**
 * Lightweight markdown for NOVA chat bubbles: **bold**, *italic* / _italic_,
 * and simple `*` / `-` list lines. Enough for KPI / report packs — not a full
 * CommonMark renderer.
 */
@Composable
fun MarkdownText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    style: TextStyle = LocalTextStyle.current,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) {
    val annotated = remember(text) { parseNovaMarkdown(text) }
    Text(
        text = annotated,
        modifier = modifier,
        color = color,
        style = style,
        maxLines = maxLines,
        overflow = overflow,
    )
}

internal fun parseNovaMarkdown(raw: String): AnnotatedString {
    if (raw.isEmpty()) return AnnotatedString("")
    val normalized = raw.replace("\r\n", "\n")
    return buildAnnotatedString {
        val lines = normalized.split('\n')
        lines.forEachIndexed { index, line ->
            appendInlineMarkdown(normalizeListPrefix(line))
            if (index < lines.lastIndex) append('\n')
        }
    }
}

private fun normalizeListPrefix(line: String): String {
    val match = LIST_PREFIX.matchEntire(line) ?: return line
    val indent = match.groupValues[1]
    val body = match.groupValues[2]
    return "$indent• $body"
}

private val LIST_PREFIX = Regex("""^([ \t]*)(?:[-*]|\d+\.)[ \t]+(.+)$""")

private fun AnnotatedString.Builder.appendInlineMarkdown(line: String) {
    var i = 0
    while (i < line.length) {
        when {
            line.startsWith("**", i) -> {
                val end = line.indexOf("**", i + 2)
                if (end >= 0) {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                        appendInlineMarkdown(line.substring(i + 2, end))
                    }
                    i = end + 2
                } else {
                    append(line[i])
                    i++
                }
            }
            line[i] == '*' || line[i] == '_' -> {
                val marker = line[i]
                val end = line.indexOf(marker, i + 1)
                if (end > i + 1 && (end + 1 >= line.length || line[end + 1] != marker)) {
                    // Avoid treating ** as single-star when we already handle ** above.
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                        append(line.substring(i + 1, end))
                    }
                    i = end + 1
                } else {
                    append(line[i])
                    i++
                }
            }
            else -> {
                append(line[i])
                i++
            }
        }
    }
}
