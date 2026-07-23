package com.biopower.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class PartnerApiKeyRequest {
    @NotNull
    private Long organizationId;

    @NotBlank
    private String name;
}
