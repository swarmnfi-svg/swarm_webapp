package com.biopower.dto.partner;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class PartnerDeviceResponse {
    private String deviceId;
    private String plantId;
    private String name;
    private String metricType;
    private String unit;
    private String readingType;
    private String status;
    private String firmwareVersion;
    private Instant lastReadingAt;
}
