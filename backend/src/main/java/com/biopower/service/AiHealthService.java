package com.biopower.service;

import com.biopower.dto.response.AiRecommendationResponse;
import com.biopower.dto.response.DashboardResponse;
import com.biopower.dto.response.PairedDeviceResponse;
import com.biopower.model.entity.AiRecommendation;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.entity.SensorReading;
import com.biopower.model.enums.*;
import com.biopower.repository.*;
import com.biopower.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AiHealthService {

    private final AiRecommendationRepository aiRecommendationRepository;
    private final SensorReadingRepository sensorReadingRepository;
    private final AlertRepository alertRepository;
    private final PlantRepository plantRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final PlantAccessService plantAccessService;

    @Transactional
    public void analyzePlant(Long plantId) {
        Map<SensorType, Double> readings = getCurrentReadings(plantId, null);
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
        // ESP MQ5 hubs report raw ADC (0-1023); only apply the % threshold for true percentage readings
        if (methane != null && methane <= 100 && methane < 50) {
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
    public DashboardResponse getDashboard(Long plantId, UserPrincipal principal) {
        plantAccessService.assertCanAccessPlant(principal, plantId);

        var plant = plantRepository.findById(plantId)
                .orElseThrow(() -> new com.biopower.exception.ResourceNotFoundException("Plant not found"));

        Set<Long> allowedNodeIds = resolveAllowedNodeIds(principal);
        Map<SensorType, Double> readings = getCurrentReadings(plantId, allowedNodeIds);
        int healthScore = aiRecommendationRepository.findFirstByPlantIdOrderByCreatedAtDesc(plantId)
                .map(AiRecommendation::getHealthScore).orElse(85);

        List<SensorNode> plantNodes = sensorNodeRepository.findByPlantPlantId(plantId);
        if (allowedNodeIds != null) {
            plantNodes = plantNodes.stream()
                    .filter(node -> allowedNodeIds.contains(node.getNodeId()))
                    .collect(Collectors.toList());
        }

        long activeNodes = plantNodes.stream().filter(n -> n.getStatus() == NodeStatus.ACTIVE).count();
        long totalNodes = plantNodes.size();
        long activeAlerts = alertRepository.countByPlantIdAndStatus(plantId, AlertStatus.ACTIVE);
        Double gasProduction = readings.getOrDefault(SensorType.GAS_FLOW, 0.0);
        List<PairedDeviceResponse> pairedDevices = buildPairedDevices(plantId, plant.getPlantName(), allowedNodeIds);
        enrichReadingsFromDevices(readings, pairedDevices);

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
                .pairedDevices(pairedDevices)
                .build();
    }

    private void enrichReadingsFromDevices(Map<SensorType, Double> readings, List<PairedDeviceResponse> devices) {
        for (PairedDeviceResponse device : devices) {
            if (device.getTemperature() != null) {
                readings.put(SensorType.TEMPERATURE, device.getTemperature());
            }
            if (device.getHumidity() != null) {
                readings.put(SensorType.HUMIDITY, device.getHumidity());
            }
            if (device.getGas() != null) {
                readings.put(SensorType.METHANE, device.getGas());
            }
        }
    }

    private List<PairedDeviceResponse> buildPairedDevices(Long plantId, String plantName, Set<Long> allowedNodeIds) {
        Map<String, List<SensorNode>> byChip = sensorNodeRepository.findByPlantPlantId(plantId).stream()
                .filter(node -> node.getDeviceChipId() != null && !node.getDeviceChipId().isBlank())
                .filter(node -> allowedNodeIds == null || allowedNodeIds.contains(node.getNodeId()))
                .collect(Collectors.groupingBy(SensorNode::getDeviceChipId));

        return byChip.entrySet().stream()
                .map(entry -> toPairedDevice(plantId, plantName, entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparing(PairedDeviceResponse::getDeviceName, String.CASE_INSENSITIVE_ORDER))
                .collect(Collectors.toList());
    }

    private PairedDeviceResponse toPairedDevice(Long plantId, String plantName, String chipId, List<SensorNode> nodes) {
        Map<SensorType, SensorNode> byType = nodes.stream()
                .collect(Collectors.toMap(SensorNode::getSensorType, Function.identity(), (a, b) -> a));

        String deviceName = nodes.stream()
                .map(SensorNode::getNodeName)
                .map(this::extractDeviceName)
                .filter(name -> name != null && !name.isBlank())
                .findFirst()
                .orElse("ESP-Hub-" + chipId.substring(Math.max(0, chipId.length() - 4)));

        LocalDateTime lastReading = nodes.stream()
                .map(SensorNode::getLastReadingAt)
                .filter(Objects::nonNull)
                .max(LocalDateTime::compareTo)
                .orElse(null);

        int avgSignal = (int) nodes.stream()
                .map(SensorNode::getSignalStrength)
                .filter(Objects::nonNull)
                .mapToInt(Integer::intValue)
                .average()
                .orElse(0);

        int avgBattery = (int) nodes.stream()
                .map(SensorNode::getBatteryLevel)
                .filter(Objects::nonNull)
                .mapToInt(Integer::intValue)
                .average()
                .orElse(0);

        String firmware = nodes.stream()
                .map(SensorNode::getFirmwareVersion)
                .filter(v -> v != null && !v.isBlank())
                .findFirst()
                .orElse(null);

        return PairedDeviceResponse.builder()
                .plantId(plantId)
                .plantName(plantName)
                .chipId(chipId)
                .deviceName(deviceName)
                .deviceIp(nodes.stream().map(SensorNode::getDeviceIp).filter(Objects::nonNull).findFirst().orElse(null))
                .sensorCount(nodes.size())
                .status(resolveDeviceStatus(nodes))
                .lastReadingAt(lastReading)
                .signalStrength(avgSignal > 0 ? avgSignal : null)
                .batteryLevel(avgBattery > 0 ? avgBattery : null)
                .firmwareVersion(firmware)
                .temperature(latestNodeValue(byType.get(SensorType.TEMPERATURE)))
                .humidity(latestNodeValue(byType.get(SensorType.HUMIDITY)))
                .gas(latestNodeValue(byType.get(SensorType.METHANE)))
                .build();
    }

    private Double latestNodeValue(SensorNode node) {
        if (node == null) {
            return null;
        }
        return sensorReadingRepository.findFirstByNodeIdOrderByRecordedAtDesc(node.getNodeId())
                .map(SensorReading::getValue)
                .orElse(null);
    }

    private String extractDeviceName(String nodeName) {
        if (nodeName == null) return null;
        for (String suffix : List.of(" Temperature", " Humidity", " Gas", " Methane")) {
            if (nodeName.endsWith(suffix)) {
                return nodeName.substring(0, nodeName.length() - suffix.length()).trim();
            }
        }
        return nodeName;
    }

    private NodeStatus resolveDeviceStatus(List<SensorNode> nodes) {
        if (nodes.stream().anyMatch(n -> n.getStatus() == NodeStatus.OFFLINE)) return NodeStatus.OFFLINE;
        if (nodes.stream().anyMatch(n -> n.getStatus() == NodeStatus.FAULTY)) return NodeStatus.FAULTY;
        if (nodes.stream().anyMatch(n -> n.getStatus() == NodeStatus.INACTIVE)) return NodeStatus.INACTIVE;
        return NodeStatus.ACTIVE;
    }

    private Map<SensorType, Double> getCurrentReadings(Long plantId, Set<Long> allowedNodeIds) {
        Map<SensorType, Double> readings = new EnumMap<>(SensorType.class);
        for (SensorType type : SensorType.values()) {
            sensorReadingRepository.findFirstByPlantIdAndSensorTypeOrderByRecordedAtDesc(plantId, type)
                    .filter(r -> allowedNodeIds == null || allowedNodeIds.contains(r.getNodeId()))
                    .ifPresent(r -> readings.put(type, r.getValue()));
        }
        return readings;
    }

    private Set<Long> resolveAllowedNodeIds(UserPrincipal principal) {
        if (!plantAccessService.shouldFilterSensorsForOperator(principal)) {
            return null;
        }
        return new HashSet<>(principal.getNodeIds());
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
      