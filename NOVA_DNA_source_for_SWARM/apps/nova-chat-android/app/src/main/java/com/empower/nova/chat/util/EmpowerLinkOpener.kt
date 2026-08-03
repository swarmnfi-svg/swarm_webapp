package com.empower.nova.chat.util

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent

/**
 * Opens emPOWER module links in the KEEP shell Android app when installed,
 * otherwise falls back to Chrome Custom Tab (browser).
 */
object EmpowerLinkOpener {
    fun resolveUrl(href: String, erpOrigin: String): String =
        if (href.startsWith("http://") || href.startsWith("https://")) {
            href
        } else {
            erpOrigin.trimEnd('/') + if (href.startsWith("/")) href else "/$href"
        }

    fun open(
        context: Context,
        href: String,
        erpOrigin: String,
        erpPackageId: String,
    ) {
        val url = resolveUrl(href, erpOrigin)
        val uri = Uri.parse(url)

        if (shouldPreferEmpowerApp(uri) && isPackageInstalled(context, erpPackageId)) {
            val appIntent = Intent(Intent.ACTION_VIEW, uri).apply {
                setPackage(erpPackageId)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            if (runCatching { context.startActivity(appIntent) }.isSuccess) {
                return
            }
        }

        if (shouldPreferEmpowerApp(uri)) {
            val viewIntent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val canOpenInEmpower = context.packageManager
                .queryIntentActivities(viewIntent, PackageManager.MATCH_DEFAULT_ONLY)
                .any { it.activityInfo.packageName == erpPackageId }
            if (canOpenInEmpower) {
                viewIntent.setPackage(erpPackageId)
                if (runCatching { context.startActivity(viewIntent) }.isSuccess) {
                    return
                }
            }
        }

        CustomTabsIntent.Builder().build().launchUrl(context, uri)
    }

    /** Production ERP hosts handled by emPOWER KEEP shell App Links. */
    private fun shouldPreferEmpowerApp(uri: Uri): Boolean {
        if (uri.scheme != "https") return false
        val host = uri.host?.lowercase() ?: return false
        return host == "erp.empowerbpg.com" ||
            host == "accounts.empowerapp.in" ||
            host.endsWith(".empowerbpg.com") ||
            host.endsWith(".empowerapp.in")
    }

    private fun isPackageInstalled(context: Context, packageId: String): Boolean =
        runCatching {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(packageId, 0)
            true
        }.getOrDefault(false)
}
