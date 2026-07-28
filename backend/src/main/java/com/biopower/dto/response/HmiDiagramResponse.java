package com.biopower.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class HmiDiagramResponse {
    private Long plantId;
    private String plantName;
    private String diagramImageUrl;
    private String pidReference;
    private boolean simulationMode;
    private List<HmiHotspotResponse> hotspots;
}
