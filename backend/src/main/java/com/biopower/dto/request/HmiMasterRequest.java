package com.biopower.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class HmiMasterRequest {
    @NotBlank
    private String action;
}
