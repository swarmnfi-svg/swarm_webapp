package com.biopower.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class HmiCommandRequest {
    @NotBlank
    private String tagNo;
    @NotBlank
    private String action;
}
