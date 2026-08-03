package com.empower.nova.chat.data.api

import com.empower.nova.chat.data.model.ClearChatRequest
import com.empower.nova.chat.data.model.ClearChatResponse
import com.empower.nova.chat.data.model.LoginRequest
import com.empower.nova.chat.data.model.LoginResponse
import com.empower.nova.chat.data.model.MeResponse
import com.empower.nova.chat.data.model.MessagesResponse
import com.empower.nova.chat.data.model.MfaVerifyRequest
import com.empower.nova.chat.data.model.OkResponse
import com.empower.nova.chat.data.model.ReportsListResponse
import com.empower.nova.chat.data.model.SaveReportRequest
import com.empower.nova.chat.data.model.SaveReportResponse
import com.empower.nova.chat.data.model.SendChatRequest
import com.empower.nova.chat.data.model.SendChatResponse
import com.empower.nova.chat.data.model.TokenRefreshRequest
import com.empower.nova.chat.data.model.TokenRefreshResponse
import com.empower.nova.chat.data.model.ThreadsResponse
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

interface NovaApiService {
    @POST("/api/client/v1/auth/login")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @POST("/api/client/v1/auth/mfa/verify")
    suspend fun verifyMfa(@Body body: MfaVerifyRequest): LoginResponse

    @POST("/api/client/v1/auth/token")
    suspend fun refreshToken(@Body body: TokenRefreshRequest): TokenRefreshResponse

    @GET("/api/client/v1/auth/me")
    suspend fun me(): MeResponse

    @GET("/api/client/v1/nova/threads")
    suspend fun threads(): ThreadsResponse

    @GET("/api/client/v1/nova/threads/{threadId}/messages")
    suspend fun messages(
        @Path("threadId") threadId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 50,
    ): MessagesResponse

    @POST("/api/client/v1/nova/chat")
    suspend fun sendChat(@Body body: SendChatRequest): SendChatResponse

    @POST("/api/client/v1/nova/chat/clear")
    suspend fun clearChat(@Body body: ClearChatRequest): ClearChatResponse

    @GET("/api/nova/reports")
    suspend fun reports(@Query("limit") limit: Int = 50): ReportsListResponse

    @POST("/api/nova/reports")
    suspend fun saveReport(@Body body: SaveReportRequest): SaveReportResponse

    @Streaming
    @GET("/api/nova/reports/{id}")
    suspend fun downloadReport(
        @Path("id") id: String,
        @Query("format") format: String = "txt",
    ): ResponseBody

    @DELETE("/api/nova/reports/{id}")
    suspend fun deleteReport(@Path("id") id: String): OkResponse

    @POST("/api/nova/reports/{id}/regenerate")
    suspend fun regenerateReport(@Path("id") id: String): OkResponse
}
