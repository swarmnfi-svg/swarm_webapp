package com.biopower.dto.response;

import com.biopower.model.enums.AiIssueType;
import com.biopower.model.enums.HealthStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class AiRecommendationResponse {
    private Long id;
    private Long plantId;
    private AiIssueType issueType;
    private String recommendation;
    private Integer healthScore;
    private HealthStatus healthStatus;
    private Boolean acknowledged;
    private LocalDateTime createdAt;
}
