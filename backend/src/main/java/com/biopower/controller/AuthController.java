package com.biopower.controller;

import com.biopower.dto.request.ChangePasswordRequest;
import com.biopower.dto.request.ForgotPasswordRequest;
import com.biopower.dto.request.LoginRequest;
import com.biopower.dto.request.SignupRequest;
import com.biopower.dto.request.SsoCallbackRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.AuthResponse;
import com.biopower.dto.response.SsoConfigResponse;
import com.biopower.security.UserPrincipal;
import com.biopower.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @GetMapping("/sso/config")
    public ResponseEntity<ApiResponse<SsoConfigResponse>> ssoConfig() {
        return ResponseEntity.ok(ApiResponse.success(authService.getSsoConfig()));
    }

    @GetMapping("/sso/login-url")
    public ResponseEntity<ApiResponse<String>> ssoLoginUrl(
            @RequestParam(required = false) String returnTo,
            @RequestParam(name = "native", required = false, defaultValue = "false") boolean nativeClient) {
        return ResponseEntity.ok(ApiResponse.success(authService.buildSsoUrl("login", returnTo, nativeClient)));
    }

    @GetMapping("/sso/signup-url")
    public ResponseEntity<ApiResponse<String>> ssoSignupUrl(
            @RequestParam(required = false) String returnTo,
            @RequestParam(name = "native", required = false, defaultValue = "false") boolean nativeClient) {
        return ResponseEntity.ok(ApiResponse.success(authService.buildSsoUrl("signup", returnTo, nativeClient)));
    }

    @PostMapping("/sso/callback")
    public ResponseEntity<ApiResponse<AuthResponse>> ssoCallback(
            @Valid @RequestBody SsoCallbackRequest request) {
        boolean nativeClient = Boolean.TRUE.equals(request.getNativeClient());
        return ResponseEntity.ok(ApiResponse.success(
                "SSO login successful", authService.exchangeSsoCode(request.getCode(), nativeClient)));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Login successful", authService.login(request)));
    }

    @PostMapping("/signup")
    public ResponseEntity<ApiResponse<AuthResponse>> signup(@Valid @RequestBody SignupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Account created successfully", authService.signup(request)));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout() {
        return ResponseEntity.ok(ApiResponse.success("Logged out successfully", null));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        authService.forgotPassword(request);
        return ResponseEntity.ok(ApiResponse.success("Password reset link sent to email", null));
    }

    @PostMapping("/change-password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(principal.getId(), request);
        return ResponseEntity.ok(ApiResponse.success("Password changed successfully", null));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<AuthResponse>> getCurrentUser(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(authService.getCurrentUser(principal)));
    }
}
