package com.biopower.repository;

import com.biopower.model.entity.HmiEquipment;
import com.biopower.model.enums.HmiZone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HmiEquipmentRepository extends JpaRepository<HmiEquipment, Long> {
    List<HmiEquipment> findByPlantIdOrderBySequenceOrderAsc(Long plantId);
    List<HmiEquipment> findByPlantIdAndZoneOrderBySequenceOrderAsc(Long plantId, HmiZone zone);
    Optional<HmiEquipment> findByPlantIdAndTagNo(Long plantId, String tagNo);
    boolean existsByPlantId(Long plantId);
    void deleteByPlantId(Long plantId);
}
