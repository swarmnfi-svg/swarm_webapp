package com.biopower.repository;

import com.biopower.model.entity.HmiEquipmentState;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HmiEquipmentStateRepository extends JpaRepository<HmiEquipmentState, Long> {
    List<HmiEquipmentState> findByPlantId(Long plantId);
    Optional<HmiEquipmentState> findByPlantIdAndEquipmentId(Long plantId, Long equipmentId);
    void deleteByPlantId(Long plantId);
}
