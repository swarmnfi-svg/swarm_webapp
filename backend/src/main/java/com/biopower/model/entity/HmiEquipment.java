package com.biopower.model.entity;

import com.biopower.model.enums.HmiEquipmentKind;
import com.biopower.model.enums.HmiZone;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "hmi_equipment", uniqueConstraints = @UniqueConstraint(columnNames = {"plant_id", "tag_no"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HmiEquipment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plant_id", nullable = false)
    private Long plantId;

    @Column(name = "tag_no", nullable = false, length = 32)
    private String tagNo;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false)
    private HmiZone zone;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "equipment_kind", nullable = false)
    private HmiEquipmentKind equipmentKind;

    @Column(nullable = false)
    private boolean controllable;

    @Column(name = "sensor_node_id")
    private Long sensorNodeId;

    @Column(name = "sequence_order")
    private Integer sequenceOrder;

    @Column(name = "motor_hp")
    private Double motorHp;

    @Column(length = 64)
    private String capacity;

    @Column(name = "hotspot_x")
    private Double hotspotX;

    @Column(name = "hotspot_y")
    private Double hotspotY;

    @Column(name = "hotspot_w")
    private Double hotspotW;

    @Column(name = "hotspot_h")
    private Double hotspotH;
}
