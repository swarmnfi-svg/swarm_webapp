package com.biopower.repository;

import com.biopower.model.entity.PredictiveMaintenance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PredictiveMaintenanceRepository extends JpaRepository<PredictiveMaintenance, Long> {
    List<PredictiveMaintenance> findByPlantId(Long plantId);
    List<PredictiveMaintenance> findByPlantIdOrderByRemainingUsefulLifeDaysAsc(Long plantId);
}
