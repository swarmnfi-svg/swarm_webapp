package com.biopower.model.entity;

import com.biopower.model.enums.AiIssueType;
import com.biopower.model.enums.HealthStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "ai_recommendations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiRecommendation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plant_id", nullable = false)
    private Long plantId;

    @Enumerated(EnumType.STRING)
    @Column(name = "issue_type", nullable = false)
    private AiIssueType issueType;

    @Column(nullable = false)
    private String recommendation;

    @Column(name = "health_score")
    private Integer healthScore;

    @Enumerated(EnumType.STRING)
    @Column(name = "health_status")
    private HealthStatus healthStatus;

    @Builder.Default
    private Boolean acknowledged = false;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
