package com.biopower.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class HmiEquipmentStateResponse {
    private Long equipmentId;
    private String tagNo;
    private String name;
    private String zone;
    private String equipmentKind;
    private boolean controllable;
    private boolean powered;
    private boolean running;
    private String mode;
    private Integer sequenceOrder;
    private Double motorHp;
    private String capacity;
    private Long sensorNodeId;
    private String sensorNodeName;
    private Double sensorValue;
    private String sensorUnit;
    private String sensorType;
    private boolean inAlarm;
}
