package com.biopower.model.entity;

import com.biopower.model.enums.AlertSeverity;
import com.biopower.model.enums.AlertStatus;
import com.biopower.model.enums.SensorType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "alerts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Alert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plant_id", nullable = false)
    private Long plantId;

    @Column(name = "node_id")
    private Long nodeId;

    @Enumerated(EnumType.STRING)
    @Column(name = "sensor_type")
    private SensorType sensorType;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AlertSeverity severity;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private AlertStatus status = AlertStatus.ACTIVE;

    private Double thresholdValue;
    private Double actualValue;

    @Column(name = "acknowledged_by")
    private Long acknowledgedBy;

    @Column(name = "acknowledged_at")
    private LocalDateTime acknowledgedAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
