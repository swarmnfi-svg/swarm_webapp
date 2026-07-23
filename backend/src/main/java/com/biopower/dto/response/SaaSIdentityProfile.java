package com.biopower.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class SaaSIdentityProfile {
    private String identityUserId;
    private String email;
    private String name;
    private String mobile;
    private String avatarUrl;
    private boolean mfaEnabled;
    private boolean mfaVerified;
}
