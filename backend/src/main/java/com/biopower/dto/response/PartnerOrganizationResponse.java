package com.biopower.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class PartnerOrganizationResponse {
    private Long id;
    private String name;
    private String externalOrgId;
    private boolean active;
    private java.util.List<Long> plantIds;
    private LocalDateTime createdAt;
}
