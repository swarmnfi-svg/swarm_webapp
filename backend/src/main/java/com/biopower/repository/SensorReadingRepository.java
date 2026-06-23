package com.biopower.repository;

import com.biopower.model.entity.SensorReading;
import com.biopower.model.enums.SensorType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface SensorReadingRepository extends JpaRepository<SensorReading, Long> {

    @Query("SELECT r FROM SensorReading r WHERE r.plantId = :plantId AND r.sensorType = :type " +
           "AND r.recordedAt BETWEEN :start AND :end ORDER BY r.recordedAt ASC")
    List<SensorReading> findByPlantAndTypeAndDateRange(
            @Param("plantId") Long plantId,
            @Param("type") SensorType type,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);

    @Query("SELECT r FROM SensorReading r WHERE r.plantId = :plantId AND r.recordedAt BETWEEN :start AND :end ORDER BY r.recordedAt ASC")
    List<SensorReading> findByPlantAndDateRange(
            @Param("plantId") Long plantId,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);

    Optional<SensorReading> findFirstByPlantIdAndSensorTypeOrderByRecordedAtDesc(Long plantId, SensorType sensorType);

    Optional<SensorReading> findFirstByNodeIdOrderByRecordedAtDesc(Long nodeId);

    @Query("SELECT AVG(r.value) FROM SensorReading r WHERE r.plantId = :plantId AND r.sensorType = :type " +
           "AND r.recordedAt BETWEEN :start AND :end")
    Double averageValue(@Param("plantId") Long plantId, @Param("type") SensorType type,
                        @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}
