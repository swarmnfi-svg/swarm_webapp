package com.biopower.service;

import com.biopower.dto.response.AiRecommendationResponse;
import com.biopower.dto.response.DashboardResponse;
import com.biopower.model.entity.AiRecommendation;
import com.biopower.model.enums.*;
import com.biopower.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AiHealthService {

    private final AiRecommendationRepository aiRecommendationRepository;
    private final SensorReadingRepository sensorReadingRepository;
    private final AlertRepository alertRepository;
    private final PlantRepository plantRepository;
    private final SensorNodeRepository sensorNodeRepository;

    @Transactional
    public void analyzePlant(Long plantId) {
        Map<SensorType, Double> readings = getCurrentReadings(plantId);
        List<String> recommendations = new ArrayList<>();
        AiIssueType issueType = null;
        int score = 100;

        Double ph = readings.get(SensorType.PH);
        if (ph != null) {
            if (ph < 6.8) {
                issueType = AiIssueType.ACIDIFICATION;
                recommendations.add("Reduce feedstock input by 15%.");
                recommendations.add("Increase mixing cycle frequency.");
                score -= 25;
            } else if (ph > 8.0) {
                issueType = AiIssueType.OVERFEEDING;
                recommendations.add("Reduce organic loading rate by 20%.");
                score -= 15;
            }
        }

        Double methane = readings.get(SensorType.METHANE);
        Double gasFlow = readings.get(SensorType.GAS_FLOW);
        if (methane != null && methane < 50) {
            issueType = AiIssueType.GAS_YIELD_REDUCTION;
            recommendations.add("Check methane concentration sensor.");
            recommendations.add("Inspect digester temperature control system.");
            score -= 20;
        }
        if (gasFlow != null && gasFlow < 1.0) {
            issueType = AiIssueType.UNDERFEEDING;
            recommendations.add("Increase feedstock input gradually by 10%.");
            score -= 10;
        }

        Double temp = readings.get(SensorType.TEMPERATURE);
        if (temp != null && (temp < 30 || temp > 42)) {
            issueType = AiIssueType.PLANT_INSTABILITY;
            recommendations.add("Stabilize digester temperature within 35-40°C range.");
            score -= 15;
        }

        long activeAlerts = alertRepository.countByPlantIdAndStatus(plantId, AlertStatus.ACTIVE);
        score -= (int) Math.min(activeAlerts * 5, 30);

        score = Math.max(0, Math.min(100, score));
        HealthStatus healthStatus = resolveHealthStatus(score);

        if (!recommendations.isEmpty() || score < 90) {
            String combined = recommendations.isEmpty()
                    ? "Plant operating within normal parameters. Continue routine monitoring."
                    : String.join(" ", recommendations);

            AiRecommendation rec = AiRecommendation.builder()
                    .plantId(plantId)
                    .issueType(issueType != null ? issueType : AiIssueType.PLANT_INSTABILITY)
                    .recommendation(combined)
                    .healthScore(score)
                    .healthStatus(healthStatus)
                    .build();
            aiRecommendationRepository.save(rec);
        }
    }

    @Transactional(readOnly = true)
    public List<AiRecommendationResponse> getRecommendations(Long plantId) {
        return aiRecommendationRepository.findByPlantIdOrderByCreatedAtDesc(plantId).stream()
                .map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional
    public void acknowledgeRecommendation(Long id) {
        aiRecommendationRepository.findById(id).ifPresent(r -> {
            r.setAcknowledged(true);
            aiRecommendationRepository.save(r);
        });
    }

    @Transactional(readOnly = true)
    public DashboardResponse getDashboard(Long plantId) {
        var plant = plantRepository.findById(plantId)
                .orElseThrow(() -> new com.biopower.exception.ResourceNotFoundException("Plant not found"));

        Map<SensorType, Double> readings = getCurrentReadings(plantId);
        int healthScore = aiRecommendationRepository.findFirstByPlantIdOrderByCreatedAtDesc(plantId)
                .map(AiRecommendation::getHealthScore).orElse(85);

        long activeNodes = sensorNodeRepository.countByPlantPlantIdAndStatus(plantId, NodeStatus.ACTIVE);
        long totalNodes = sensorNodeRepository.findByPlantPlantId(plantId).size();
        long activeAlerts = alertRepository.countByPlantIdAndStatus(plantId, AlertStatus.ACTIVE);
        Double gasProduction = readings.getOrDefault(SensorType.GAS_FLOW, 0.0);

        return DashboardResponse.builder()
                .plantId(plantId)
                .plantName(plant.getPlantName())
                .healthStatus(resolveHealthStatus(healthScore))
                .healthScore(healthScore)
                .currentReadings(readings)
                .activeAlerts(activeAlerts)
                .activeNodes(activeNodes)
                .totalNodes(totalNodes)
                .gasProduction(gasProduction)
                .plantStatus(plant.getStatus())
                .lastUpdated(LocalDateTime.now())
                .build();
    }

    private Map<SensorType, Double> getCurrentReadings(Long plantId) {
        Map<SensorType, Double> readings = new EnumMap<>(SensorType.class);
        for (SensorType type : SensorType.values()) {
            sensorReadingRepository.findFirstByPlantIdAndSensorTypeOrderByRecordedAtDesc(plantId, type)
                    .ifPresent(r -> readings.put(type, r.getValue()));
        }
        return readings;
    }

    private HealthStatus resolveHealthStatus(int score) {
        if (score >= 90) return HealthStatus.EXCELLENT;
        if (score >= 75) return HealthStatus.GOOD;
        if (score >= 60) return HealthStatus.AVERAGE;
        if (score >= 40) return HealthStatus.POOR;
        return HealthStatus.CRITICAL;
    }

    private AiRecommendationResponse toResponse(AiRecommendation rec) {
        return AiRecommendationResponse.builder()
                .id(rec.getId())
                .plantId(rec.getPlantId())
                .issueType(rec.getIssueType())
                .recommendation(rec.getRecommendation())
                .healthScore(rec.getHealthScore())
                .healthStatus(rec.getHealthStatus())
                .acknowledged(rec.getAcknowledged())
                .createdAt(rec.getCreatedAt())
                .build();
    }
}
