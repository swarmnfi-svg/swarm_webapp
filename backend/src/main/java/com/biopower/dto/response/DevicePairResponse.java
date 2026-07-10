package com.biopower.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DevicePairResponse {
    private String chipId;
    private String deviceName;
    private Long plantId;
    private Long temperatureNodeId;
    private Long humidityNodeId;
    private Long gasNodeId;
    private boolean newlyPaired;
}
