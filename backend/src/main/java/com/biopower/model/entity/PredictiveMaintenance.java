package com.biopower.model.entity;

import com.biopower.model.enums.EquipmentType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "predictive_maintenance")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PredictiveMaintenance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plant_id", nullable = false)
    private Long plantId;

    @Enumerated(EnumType.STRING)
    @Column(name = "equipment_type", nullable = false)
    private EquipmentType equipmentType;

    @Column(name = "equipment_name", nullable = false)
    private String equipmentName;

    @Column(name = "remaining_useful_life_days")
    private Integer remainingUsefulLifeDays;

    @Column(name = "estimated_failure_date")
    private LocalDate estimatedFailureDate;

    @Column(name = "health_percentage")
    private Double healthPercentage;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
