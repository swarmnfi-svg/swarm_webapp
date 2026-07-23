package com.biopower.controller;

import com.biopower.dto.request.PartnerApiKeyRequest;
import com.biopower.dto.request.PartnerOrganizationRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.PartnerApiKeyCreatedResponse;
import com.biopower.dto.response.PartnerOrganizationResponse;
import com.biopower.service.PartnerApiKeyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/admin/partner")
@RequiredArgsConstructor
public class PartnerAdminController {

    private final PartnerApiKeyService partnerApiKeyService;

    @GetMapping("/organizations")
    public ResponseEntity<ApiResponse<List<PartnerOrganizationResponse>>> listOrganizations() {
        return ResponseEntity.ok(ApiResponse.success(partnerApiKeyService.listOrganizations()));
    }

    @PostMapping("/organizations")
    public ResponseEntity<ApiResponse<PartnerOrganizationResponse>> createOrganization(
            @Valid @RequestBody PartnerOrganizationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Organization created", partnerApiKeyService.createOrganization(request)));
    }

    @PostMapping("/api-keys")
    public ResponseEntity<ApiResponse<PartnerApiKeyCreatedResponse>> createApiKey(
            @Valid @RequestBody PartnerApiKeyRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("API key created", partnerApiKeyService.createApiKey(request)));
    }

    @DeleteMapping("/api-keys/{id}")
    public ResponseEntity<ApiResponse<Void>> revokeApiKey(@PathVariable Long id) {
        partnerApiKeyService.revokeApiKey(id);
        return ResponseEntity.ok(ApiResponse.success("API key revoked", null));
    }
}
