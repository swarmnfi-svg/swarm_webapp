package com.biopower.dto.partner;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class PartnerHealthResponse {
    private String status;
    private String apiVersion;
    private String organizationId;
    private String organizationName;
    private Instant serverTime;
}
