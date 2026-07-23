package com.biopower.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class PartnerApiKeyCreatedResponse {
    private Long id;
    private Long organizationId;
    private String name;
    private String keyPrefix;
    private String apiKey;
    private LocalDateTime createdAt;
}
