package com.biopower.repository;

import com.biopower.model.entity.SensorReading;
import com.biopower.model.enums.SensorType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
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

    @Query("SELECT r FROM SensorReading r WHERE r.plantId IN :plantIds " +
           "AND (:plantId IS NULL OR r.plantId = :plantId) " +
           "AND (:nodeId IS NULL OR r.nodeId = :nodeId) " +
           "AND (:sensorType IS NULL OR r.sensorType = :sensorType) " +
           "AND (:updatedSince IS NULL OR r.recordedAt >= :updatedSince) " +
           "AND ((:cursorTime IS NULL AND :cursorId IS NULL) OR r.recordedAt > :cursorTime OR (r.recordedAt = :cursorTime AND r.id > :cursorId)) " +
           "ORDER BY r.recordedAt ASC, r.id ASC")
    List<SensorReading> findPartnerHistory(
            @Param("plantIds") List<Long> plantIds,
            @Param("plantId") Long plantId,
            @Param("nodeId") Long nodeId,
            @Param("sensorType") SensorType sensorType,
            @Param("updatedSince") LocalDateTime updatedSince,
            @Param("cursorTime") LocalDateTime cursorTime,
            @Param("cursorId") Long cursorId,
            org.springframework.data.domain.Pageable pageable);

    @Query("SELECT r FROM SensorReading r WHERE r.plantId IN :plantIds " +
           "AND r.recordedAt BETWEEN :start AND :end " +
           "AND (:plantId IS NULL OR r.plantId = :plantId) " +
           "AND (:nodeId IS NULL OR r.nodeId = :nodeId) " +
           "AND (:sensorType IS NULL OR r.sensorType = :sensorType) " +
           "ORDER BY r.recordedAt ASC")
    List<SensorReading> findPartnerRange(
            @Param("plantIds") List<Long> plantIds,
            @Param("plantId") Long plantId,
            @Param("nodeId") Long nodeId,
            @Param("sensorType") SensorType sensorType,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);

    @Modifying
    @Query("DELETE FROM SensorReading r WHERE r.plantId = :plantId")
    void deleteByPlantId(@Param("plantId") Long plantId);

    @Modifying
    @Query("DELETE FROM SensorReading r WHERE r.recordedAt < :cutoff")
    int deleteByRecordedAtBefore(@Param("cutoff") LocalDateTime cutoff);
}
