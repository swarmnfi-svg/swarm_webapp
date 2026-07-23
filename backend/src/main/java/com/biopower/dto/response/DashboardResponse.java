package com.biopower.dto.response;

import com.biopower.model.enums.*;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Builder
public class DashboardResponse {
    private Long plantId;
    private String plantName;
    private HealthStatus healthStatus;
    private Integer healthScore;
    private Map<SensorType, Double> currentReadings;
    private Long activeAlerts;
    private Long activeNodes;
    private Long totalNodes;
    private Double gasProduction;
    private PlantStatus plantStatus;
    private LocalDateTime lastUpdated;
    private List<PairedDeviceResponse> pairedDevices;
    private List<SensorType> visibleSensorTypes;
}
