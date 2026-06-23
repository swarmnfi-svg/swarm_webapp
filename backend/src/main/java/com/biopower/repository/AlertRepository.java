package com.biopower.repository;

import com.biopower.model.entity.Alert;
import com.biopower.model.enums.AlertSeverity;
import com.biopower.model.enums.AlertStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AlertRepository extends JpaRepository<Alert, Long> {
    List<Alert> findByPlantIdOrderByCreatedAtDesc(Long plantId);
    List<Alert> findByStatus(AlertStatus status);
    List<Alert> findByPlantIdAndStatus(Long plantId, AlertStatus status);
    List<Alert> findByPlantIdInAndStatus(List<Long> plantIds, AlertStatus status);
    long countByPlantIdAndStatus(Long plantId, AlertStatus status);
    long countByStatus(AlertStatus status);
    List<Alert> findBySeverity(AlertSeverity severity);
    boolean existsByPlantIdAndTitleAndStatus(Long plantId, String title, AlertStatus status);
}
