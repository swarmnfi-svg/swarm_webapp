package com.biopower.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SsoCallbackRequest {
    @NotBlank
    private String code;

    /** When true, token exchange uses the Android deep-link redirect_uri. */
    private Boolean native;
}
