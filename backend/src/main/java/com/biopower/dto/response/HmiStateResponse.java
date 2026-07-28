package com.biopower.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class HmiStateResponse {
    private Long plantId;
    private boolean plantPowered;
    private boolean autoSequenceActive;
    private int autoSequenceStep;
    private int runningCount;
    private int controllableCount;
    private boolean simulationMode;
    private List<HmiEquipmentStateResponse> equipment;
    private List<String> alarmTags;
}
