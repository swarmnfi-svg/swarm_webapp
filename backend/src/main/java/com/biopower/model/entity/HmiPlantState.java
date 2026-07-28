package com.biopower.model.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "hmi_plant_state")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HmiPlantState {

    @Id
    @Column(name = "plant_id")
    private Long plantId;

    @Builder.Default
    private boolean plantPowered = false;

    @Builder.Default
    private boolean autoSequenceActive = false;

    @Column(name = "auto_sequence_step")
    @Builder.Default
    private Integer autoSequenceStep = 0;

    @Column(name = "last_changed_by")
    private Long lastChangedBy;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
