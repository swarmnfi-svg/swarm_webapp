package com.empower.nova.chat

import android.app.Application
import android.util.Log
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class NovaChatApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val prior = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e(TAG, "Uncaught exception on ${thread.name}", throwable)
            prior?.uncaughtException(thread, throwable)
        }
    }

    companion object {
        private const val TAG = "NovaChatApp"
    }
}
