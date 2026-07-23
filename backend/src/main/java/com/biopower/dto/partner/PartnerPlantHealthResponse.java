package com.biopower.dto.partner;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;

@Data
@Builder
public class PartnerPlantHealthResponse {
    private String plantId;
    private String plantName;
    private Integer healthScore;
    private String healthStatus;
    private Long activeAlerts;
    private Long activeDevices;
    private Long totalDevices;
    private Instant lastUpdated;
    private List<String> recommendations;
}
