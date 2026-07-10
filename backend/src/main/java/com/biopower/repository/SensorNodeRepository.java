package com.biopower.repository;

import com.biopower.model.entity.SensorNode;
import com.biopower.model.enums.NodeStatus;
import com.biopower.model.enums.SensorType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface SensorNodeRepository extends JpaRepository<SensorNode, Long> {
    List<SensorNode> findByPlantPlantId(Long plantId);
    List<SensorNode> findByPlantPlantIdAndStatus(Long plantId, NodeStatus status);
    Optional<SensorNode> findByNodeIdAndPlantPlantId(Long nodeId, Long plantId);
    List<SensorNode> findByLastReadingAtBeforeAndStatus(LocalDateTime threshold, NodeStatus status);
    List<SensorNode> findByLastReadingAtIsNullAndStatusAndCreatedAtBefore(NodeStatus status, LocalDateTime createdBefore);
    long countByPlantPlantIdAndStatus(Long plantId, NodeStatus status);
    List<SensorNode> findByPlantPlantIdAndSensorType(Long plantId, SensorType sensorType);
    List<SensorNode> findByPlantPlantIdAndDeviceChipId(Long plantId, String deviceChipId);
    List<SensorNode> findByPlantPlantIdAndSensorTypeAndDeviceChipIdIsNull(Long plantId, SensorType sensorType);
}
