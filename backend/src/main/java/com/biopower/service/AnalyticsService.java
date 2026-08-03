package com.biopower.service;

import com.biopower.dto.response.PredictiveMaintenanceResponse;
import com.biopower.dto.response.SensorReadingResponse;
import com.biopower.model.entity.PredictiveMaintenance;
import com.biopower.model.enums.EquipmentType;
import com.biopower.model.enums.SensorType;
import com.biopower.repository.PredictiveMaintenanceRepository;
import com.biopower.repository.SensorReadingRepository;
import com.biopower.security.UserPrincipal;
import com.biopower.service.PlantAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private final SensorReadingRepository sensorReadingRepository;
    private final PlantAccessService plantAccessService;

    @Transactional(readOnly = true)
    public List<SensorReadingResponse> getHistoricalData(Long plantId, SensorType sensorType,
                                                          LocalDateTime start, LocalDateTime end,
                                                          UserPrincipal principal) {
        plantAccessService.assertCanAccessPlant(principal, plantId);
        return getHistoricalData(plantId, sensorType, start, end);
    }

    @Transactional(readOnly = true)
    public List<SensorReadingResponse> getAllSensorData(Long plantId, LocalDateTime start, LocalDateTime end,
                                                         UserPrincipal principal) {
        plantAccessService.assertCanAccessPlant(principal, plantId);
        return getAllSensorData(plantId, start, end);
    }

    @Transactional(readOnly = true)
    public List<SensorReadingResponse> getHistoricalData(Long plantId, SensorType sensorType,
                                                          LocalDateTime start, LocalDateTime end) {
        return sensorReadingRepository.findByPlantAndTypeAndDateRange(plantId, sensorType, start, end)
                .stream()
                .map(r -> SensorReadingResponse.builder()
                        .id(r.getId())
                        .plantId(r.getPlantId())
                        .nodeId(r.getNodeId())
                        .sensorType(r.getSensorType())
                        .value(r.getValue())
                        .recordedAt(r.getRecordedAt())
                        .build())
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<SensorReadingResponse> getAllSensorData(Long plantId, LocalDateTime start, LocalDateTime end) {
        return sensorReadingRepository.findByPlantAndDateRange(plantId, start, end)
                .stream()
                .map(r -> SensorReadingResponse.builder()
                        .id(r.getId())
                        .plantId(r.getPlantId())
                        .nodeId(r.getNodeId())
                        .sensorType(r.getSensorType())
                        .value(r.getValue())
                        .recordedAt(r.getRecordedAt())
                        .build())
                .collect(Collectors.toList());
    }
}
