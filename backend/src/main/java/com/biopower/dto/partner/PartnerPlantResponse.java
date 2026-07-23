package com.biopower.dto.partner;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class PartnerPlantResponse {
    private String plantId;
    private String name;
    private String type;
    private String status;
    private String location;
    private Double capacity;
}
