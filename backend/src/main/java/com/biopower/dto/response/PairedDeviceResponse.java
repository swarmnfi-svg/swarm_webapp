package com.biopower.dto.response;

import com.biopower.model.enums.NodeStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class PairedDeviceResponse {
    private Long plantId;
    private String plantName;
    private String chipId;
    private String deviceName;
    private String deviceIp;
    private int sensorCount;
    private NodeStatus status;
    private LocalDateTime lastReadingAt;
    private Integer signalStrength;
    private Integer batteryLevel;
    private String firmwareVersion;
    private Double temperature;
    private Double humidity;
    private Double gas;
}
