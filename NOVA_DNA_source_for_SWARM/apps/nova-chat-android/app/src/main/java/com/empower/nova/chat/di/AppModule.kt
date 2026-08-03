package com.empower.nova.chat.di

import com.empower.nova.chat.BuildConfig
import com.empower.nova.chat.data.api.AnyJsonAdapter
import com.empower.nova.chat.data.api.NovaApiService
import com.empower.nova.chat.data.api.OkHttpClientProvider
import com.empower.nova.chat.data.api.PackPayloadAdapter
import com.empower.nova.chat.data.api.SendChatResponseManualAdapter
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @Singleton
    fun provideMoshi(): Moshi =
        Moshi.Builder()
            // Hand-built SendChatResponse / SaveReportRequest — pack never touches Map/Object codegen.
            .add(SendChatResponseManualAdapter.factory())
            // Object/Any before pack — prevents Map<String, Object> converter failures.
            .add(AnyJsonAdapter.factory())
            .add(PackPayloadAdapter.factory())
            .add(PackPayloadAdapter())
            .addLast(KotlinJsonAdapterFactory())
            .build()

    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClientProvider: OkHttpClientProvider,
        moshi: Moshi,
    ): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL.ensureTrailingSlash())
            .client(okHttpClientProvider.client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()

    @Provides
    @Singleton
    fun provideNovaApiService(retrofit: Retrofit): NovaApiService =
        retrofit.create(NovaApiService::class.java)
}

private fun String.ensureTrailingSlash(): String =
    if (endsWith("/")) this else "$this/"
