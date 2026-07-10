package com.biopower.dto.response;

import com.biopower.model.enums.NodeStatus;
import com.biopower.model.enums.SensorType;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class SensorNodeResponse {
    private Long nodeId;
    private Long plantId;
    private String plantName;
    private String nodeName;
    private String deviceChipId;
    private String deviceIp;
    private SensorType sensorType;
    private String firmwareVersion;
    private Integer batteryLevel;
    private Integer signalStrength;
    private NodeStatus status;
    private Double lastValue;
    private LocalDateTime lastReadingAt;
    private LocalDateTime createdAt;
}
