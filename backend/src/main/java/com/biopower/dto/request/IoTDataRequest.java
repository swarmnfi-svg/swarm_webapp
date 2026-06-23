package com.biopower.dto.request;

import com.biopower.model.enums.SensorType;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class IoTDataRequest {
    @NotNull
    private Long plantId;
    @NotNull
    private Long nodeId;
    @NotNull
    private SensorType sensorType;
    @NotNull
    private Double value;
    private LocalDateTime timestamp;
}
