package com.empower.nova.chat.util

import java.util.Calendar

fun greetingForHour(hour: Int = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)): String =
    when (hour) {
        in 5..11 -> "Good morning"
        in 12..16 -> "Good afternoon"
        in 17..20 -> "Good evening"
        else -> "Hello"
    }

fun firstName(fullName: String): String =
    fullName.trim().substringBefore(' ').ifBlank { fullName }
