package com.biopower.dto.response;

import com.biopower.model.enums.*;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Builder
public class PlantResponse {
    private Long plantId;
    private String plantName;
    private PlantType plantType;
    private String location;
    private Double capacity;
    private String feedstockType;
    private LocalDate installationDate;
    private PlantStatus status;
    private Integer activeNodes;
    private Integer activeAlerts;
    private Integer healthScore;
    private HealthStatus healthStatus;
    private LocalDateTime createdAt;
}
