package com.biopower.dto.response;

import com.biopower.model.enums.SensorType;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class SensorReadingResponse {
    private Long id;
    private Long plantId;
    private Long nodeId;
    private SensorType sensorType;
    private Double value;
    private LocalDateTime recordedAt;
}
