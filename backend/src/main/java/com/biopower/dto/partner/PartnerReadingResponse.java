package com.biopower.dto.partner;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class PartnerReadingResponse {
    private String deviceId;
    private String plantId;
    private String metricType;
    private Double value;
    private String unit;
    private String readingType;
    private String quality;
    private Instant recordedAt;
}
