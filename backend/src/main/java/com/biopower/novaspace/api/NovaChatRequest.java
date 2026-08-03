package com.biopower.novaspace.api;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class NovaChatRequest {
    @NotBlank
    private String message;
    private Long threadId;
}
