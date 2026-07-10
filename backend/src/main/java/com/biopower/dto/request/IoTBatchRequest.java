package com.biopower.dto.request;

import com.biopower.model.enums.SensorType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class IoTBatchRequest {
    @NotNull
    private Long plantId;
    private String chipId;
    private Integer rssi;
    @NotEmpty
    @Valid
    private List<Reading> readings;

    @Data
    public static class Reading {
        @NotNull
        private Long nodeId;
        @NotNull
        private SensorType sensorType;
        @NotNull
        private Double value;
    }
}
