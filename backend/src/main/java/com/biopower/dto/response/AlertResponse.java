package com.biopower.dto.response;

import com.biopower.model.enums.AlertSeverity;
import com.biopower.model.enums.AlertStatus;
import com.biopower.model.enums.SensorType;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class AlertResponse {
    private Long id;
    private Long plantId;
    private String plantName;
    private Long nodeId;
    private SensorType sensorType;
    private String title;
    private String message;
    private AlertSeverity severity;
    private AlertStatus status;
    private Double thresholdValue;
    private Double actualValue;
    private LocalDateTime createdAt;
    private LocalDateTime acknowledgedAt;
    private LocalDateTime resolvedAt;
}
