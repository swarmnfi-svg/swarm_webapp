package com.biopower.service;

import com.biopower.dto.request.PlantRequest;
import com.biopower.dto.response.PlantResponse;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.Plant;
import com.biopower.model.enums.AlertStatus;
import com.biopower.model.enums.HealthStatus;
import com.biopower.model.enums.NodeStatus;
import com.biopower.model.enums.PlantStatus;
import com.biopower.repository.AiRecommendationRepository;
import com.biopower.repository.AlertRepository;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorNodeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PlantService {

    private final PlantRepository plantRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final AlertRepository alertRepository;
    private final AiRecommendationRepository aiRecommendationRepository;

    @Transactional(readOnly = true)
    public List<PlantResponse> getAllPlants() {
        return plantRepository.findAll().stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<PlantResponse> getPlantsForUser(List<Long> plantIds, boolean isSuperAdmin) {
        if (isSuperAdmin) return getAllPlants();
        return plantRepository.findByPlantIdIn(plantIds).stream()
                .map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PlantResponse getPlantById(Long id) {
        return toResponse(findPlant(id));
    }

    @Transactional
    public PlantResponse createPlant(PlantRequest request) {
        Plant plant = Plant.builder()
                .plantName(request.getPlantName())
                .plantType(request.getPlantType())
                .location(request.getLocation())
                .capacity(request.getCapacity())
                .feedstockType(request.getFeedstockType())
                .installationDate(request.getInstallationDate())
                .status(request.getStatus() != null ? request.getStatus() : PlantStatus.ACTIVE)
                .build();
        return toResponse(plantRepository.save(plant));
    }

    @Transactional
    public PlantResponse updatePlant(Long id, PlantRequest request) {
        Plant plant = findPlant(id);
        plant.setPlantName(request.getPlantName());
        plant.setPlantType(request.getPlantType());
        plant.setLocation(request.getLocation());
        plant.setCapacity(request.getCapacity());
        plant.setFeedstockType(request.getFeedstockType());
        plant.setInstallationDate(request.getInstallationDate());
        if (request.getStatus() != null) plant.setStatus(request.getStatus());
        return toResponse(plantRepository.save(plant));
    }

    @Transactional
    public void deletePlant(Long id) {
        plantRepository.delete(findPlant(id));
    }

    public Plant findPlant(Long id) {
        return plantRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Plant not found: " + id));
    }

    private PlantResponse toResponse(Plant plant) {
        int activeNodes = (int) sensorNodeRepository.countByPlantPlantIdAndStatus(plant.getPlantId(), NodeStatus.ACTIVE);
        int activeAlerts = (int) alertRepository.countByPlantIdAndStatus(plant.getPlantId(), AlertStatus.ACTIVE);
        Integer healthScore = aiRecommendationRepository.findFirstByPlantIdOrderByCreatedAtDesc(plant.getPlantId())
                .map(r -> r.getHealthScore()).orElse(85);
        HealthStatus healthStatus = resolveHealthStatus(healthScore);

        return PlantResponse.builder()
                .plantId(plant.getPlantId())
                .plantName(plant.getPlantName())
                .plantType(plant.getPlantType())
                .location(plant.getLocation())
                .capacity(plant.getCapacity())
                .feedstockType(plant.getFeedstockType())
                .installationDate(plant.getInstallationDate())
                .status(plant.getStatus())
                .activeNodes(activeNodes)
                .activeAlerts(activeAlerts)
                .healthScore(healthScore)
                .healthStatus(healthStatus)
                .createdAt(plant.getCreatedAt())
                .build();
    }

    private HealthStatus resolveHealthStatus(int score) {
        if (score >= 90) return HealthStatus.EXCELLENT;
        if (score >= 75) return HealthStatus.GOOD;
        if (score >= 60) return HealthStatus.AVERAGE;
        if (score >= 40) return HealthStatus.POOR;
        return HealthStatus.CRITICAL;
    }
}
