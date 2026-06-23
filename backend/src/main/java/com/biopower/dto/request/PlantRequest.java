package com.biopower.dto.request;

import com.biopower.model.enums.PlantStatus;
import com.biopower.model.enums.PlantType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class PlantRequest {
    @NotBlank
    private String plantName;
    @NotNull
    private PlantType plantType;
    private String location;
    private Double capacity;
    private String feedstockType;
    private LocalDate installationDate;
    private PlantStatus status;
}
