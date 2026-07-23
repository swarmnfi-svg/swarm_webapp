package com.biopower.dto.partner;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class PartnerAlertResponse {
    private String alertId;
    private String plantId;
    private String deviceId;
    private String metricType;
    private String title;
    private String message;
    private String severity;
    private String status;
    private Instant createdAt;
    private Instant updatedAt;
}
