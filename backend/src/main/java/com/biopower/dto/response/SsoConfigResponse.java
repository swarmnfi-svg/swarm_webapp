package com.biopower.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class SsoConfigResponse {
    private String mode;
    private boolean saasEnabled;
    private String accountsUrl;
    private String clientId;
    private String appUrl;
    private String callbackPath;
    /** Android deep-link redirect_uri (must be registered with emPOWER). */
    private String nativeCallbackUri;
}
