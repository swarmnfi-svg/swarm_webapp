package com.biopower.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class PartnerOrganizationRequest {
    @NotBlank
    private String name;

    @NotBlank
    private String externalOrgId;

    private List<Long> plantIds;
}
