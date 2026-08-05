package com.biopower.service;

import com.biopower.config.EmpowerSaaSAuthProperties;
import com.biopower.dto.response.SaaSIdentityProfile;
import com.biopower.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Consumer client for emPOWER SaaS identity (accounts.empowerapp.in).
 * SWARM does not own the identity schema — emPOWER SaaS Railway Postgres is SoT.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmpowerSaaSAuthClient {

    /** Must be registered with emPOWER as an allowed OAuth redirect_uri for the SWARM Android app. */
    public static final String NATIVE_CALLBACK_URI = "com.nanofarm.swarm://auth/callback";

    private final EmpowerSaaSAuthProperties props;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    public String buildAuthorizeUrl(String flow, String returnTo, boolean nativeClient) {
        String redirectUri = callbackUrl(nativeClient);
        StringBuilder url = new StringBuilder(props.getAccountsUrl())
                .append("/").append(flow)
                .append("?client_id=").append(enc(props.getClientId()))
                .append("&app=swarm_webapp")
                .append("&redirect_uri=").append(enc(redirectUri));
        if (returnTo != null && !returnTo.isBlank()) {
            url.append("&return_to=").append(enc(returnTo));
        }
        return url.toString();
    }

    public String callbackUrl() {
        return callbackUrl(false);
    }

    public String callbackUrl(boolean nativeClient) {
        if (nativeClient) {
            return NATIVE_CALLBACK_URI;
        }
        String base = props.getAppUrl().replaceAll("/$", "");
        return base + "/auth/callback";
    }

    public SaaSIdentityProfile exchangeAuthCode(String code, boolean nativeClient) {
        if (props.getClientSecret() == null || props.getClientSecret().isBlank()) {
            throw new BadRequestException(
                    "SWARM SaaS client secret not configured. Set biopower.identity.saas.client-secret.");
        }
        String tokenUrl = props.getAccountsUrl().replaceAll("/$", "") + props.getTokenPath();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, String> body = Map.of(
                "grant_type", "authorization_code",
                "code", code,
                "client_id", props.getClientId(),
                "client_secret", props.getClientSecret(),
                "redirect_uri", callbackUrl(nativeClient)
        );
        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    tokenUrl, HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
            return parseProfile(response.getBody());
        } catch (HttpStatusCodeException ex) {
            log.warn("SaaS token exchange failed: {} {}", ex.getStatusCode(), ex.getResponseBodyAsString());
            if (ex.getStatusCode() == HttpStatus.FORBIDDEN) {
                throw new BadRequestException("MFA required. Complete verification at accounts.empowerapp.in");
            }
            throw new BadRequestException("Invalid or expired authorization code");
        }
    }

    private SaaSIdentityProfile parseProfile(String json) {
        try {
            JsonNode root = objectMapper.readTree(json);
            JsonNode data = root.has("data") ? root.get("data") : root;
            String identityUserId = text(data, "identityUserId", "central_user_id", "id");
            if (identityUserId == null || identityUserId.isBlank()) {
                throw new BadRequestException("SaaS identity response missing user id");
            }
            boolean mfaEnabled = data.path("mfaEnabled").asBoolean(false);
            boolean mfaVerified = data.path("mfaVerified").asBoolean(!mfaEnabled);
            if (mfaEnabled && !mfaVerified) {
                throw new BadRequestException("MFA required. Complete verification at accounts.empowerapp.in");
            }
            return SaaSIdentityProfile.builder()
                    .identityUserId(identityUserId)
                    .email(text(data, "email"))
                    .name(text(data, "name"))
                    .mobile(text(data, "mobile"))
                    .avatarUrl(text(data, "avatarUrl", "avatar_url", "picture"))
                    .mfaEnabled(mfaEnabled)
                    .mfaVerified(mfaVerified)
                    .build();
        } catch (BadRequestException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BadRequestException("Failed to parse SaaS identity response");
        }
    }

    private static String text(JsonNode node, String... fields) {
        for (String field : fields) {
            if (node.hasNonNull(field) && !node.get(field).asText().isBlank()) {
                return node.get(field).asText();
            }
        }
        return null;
    }

    private static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
