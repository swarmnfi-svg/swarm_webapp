package com.biopower.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SsoCallbackRequest {
    @NotBlank
    private String code;

    /** When true, token exchange uses the Android deep-link redirect_uri. */
    @JsonProperty("native")
    private Boolean nativeClient;
}
