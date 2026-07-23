package com.biopower.dto.partner;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;

@Data
@Builder
public class PartnerDailyAggregateResponse {
    private String deviceId;
    private String plantId;
    private String metricType;
    private String unit;
    private String readingType;
    private LocalDate date;
    private Double min;
    private Double max;
    private Double avg;
    private Double sum;
    private Long count;
    private Double completeness;
    private String quality;
}
