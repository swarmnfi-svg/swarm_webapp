package com.biopower.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class HmiHotspotResponse {
    private String tagNo;
    private String name;
    private String zone;
    private double x;
    private double y;
    private double w;
    private double h;
}
