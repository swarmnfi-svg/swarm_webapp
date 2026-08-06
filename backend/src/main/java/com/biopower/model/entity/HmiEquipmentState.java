package com.biopower.model.entity;

import com.biopower.model.enums.HmiControlMode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Entity
@Table(name = "hmi_equipment_state", uniqueConstraints = @UniqueConstraint(columnNames = {"plant_id", "equipment_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HmiEquipmentState {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plant_id", nullable = false)
    private Long plantId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "equipment_id", nullable = false)
    private HmiEquipment equipment;

    @Builder.Default
    private boolean powered = false;

    @Builder.Default
    private boolean running = false;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Builder.Default
    private HmiControlMode mode = HmiControlMode.OFF;

    @Column(name = "last_changed_by")
    private Long lastChangedBy;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
