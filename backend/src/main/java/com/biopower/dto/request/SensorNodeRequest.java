package com.biopower.dto.request;

import com.biopower.model.enums.NodeStatus;
import com.biopower.model.enums.SensorType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SensorNodeRequest {
    @NotNull
    private Long plantId;
    @NotBlank
    private String nodeName;
    @NotNull
    private SensorType sensorType;
    private String firmwareVersion;
    private Integer batteryLevel;
    private Integer signalStrength;
    private NodeStatus status;
}
