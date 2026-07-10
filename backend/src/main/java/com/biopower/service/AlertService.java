package com.biopower.service;

import com.biopower.dto.response.AlertResponse;
import com.biopower.model.entity.Alert;
import com.biopower.model.entity.SensorReading;
import com.biopower.model.enums.*;
import com.biopower.repository.AlertRepository;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorNodeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AlertService {

    private final AlertRepository alertRepository;
    private final PlantRepository plantRepository;
    private final SensorNodeRepository sensorNodeRepository;

    @Value("${biopower.alert.ph-min}")
    private double phMin;
    @Value("${biopower.alert.ph-max}")
    private double phMax;
    @Value("${biopower.alert.temp-min}")
    private double tempMin;
    @Value("${biopower.alert.temp-max}")
    private double tempMax;
    @Value("${biopower.alert.pressure-max}")
    private double pressureMax;
    @Value("${biopower.alert.sensor-timeout-minutes}")
    private int sensorTimeoutMinutes;

    @Transactional
    public void evaluateReading(SensorReading reading) {
        switch (reading.getSensorType()) {
            case PH -> evaluatePh(reading);
            case TEMPERATURE -> evaluateTemperature(reading);
            case PRESSURE -> evaluatePressure(reading);
            case GAS_FLOW -> evaluateGasFlow(reading);
            default -> {}
        }
    }

    private void evaluatePh(SensorReading reading) {
        double value = reading.getValue();
        if (value < phMin) {
            createAlert(reading, "pH Below Threshold",
                    String.format("pH level %.2f is below minimum threshold of %.1f", value, phMin),
                    AlertSeverity.CRITICAL, phMin, value);
        } else if (value > phMax) {
            createAlert(reading, "pH Above Threshold",
                    String.format("pH level %.2f exceeds maximum threshold of %.1f", value, phMax),
                    AlertSeverity.WARNING, phMax, value);
        }
    }

    private void evaluateTemperature(SensorReading reading) {
        double value = reading.getValue();
        if (value < tempMin) {
            createAlert(reading, "Temperature Below Threshold",
                    String.format("Temperature %.1f°C is below minimum of %.0f°C", value, tempMin),
                    AlertSeverity.WARNING, tempMin, value);
        } else if (value > tempMax) {
            createAlert(reading, "Temperature Above Threshold",
                    String.format("Temperature %.1f°C exceeds maximum of %.0f°C", value, tempMax),
                    AlertSeverity.CRITICAL, tempMax, value);
        }
    }

    private void evaluatePressure(SensorReading reading) {
        if (reading.getValue() > pressureMax) {
            createAlert(reading, "Pressure Above Threshold",
                    String.format("Pressure %.2f bar exceeds maximum of %.1f bar", reading.getValue(), pressureMax),
                    AlertSeverity.CRITICAL, pressureMax, reading.getValue());
        }
    }

    private void evaluateGasFlow(SensorReading reading) {
        if (reading.getValue() < 0.5) {
            createAlert(reading, "Gas Flow Drop Detected",
                    String.format("Sudden gas flow drop detected: %.2f m³/h", reading.getValue()),
                    AlertSeverity.WARNING, 0.5, reading.getValue());
        }
    }

    private void createAlert(SensorReading reading, String title, String message,
                             AlertSeverity severity, double threshold, double actual) {
        if (alertRepository.existsByPlantIdAndTitleAndStatus(reading.getPlantId(), title, AlertStatus.ACTIVE)) {
            return;
        }
        Alert alert = Alert.builder()
                .plantId(reading.getPlantId())
                .nodeId(reading.getNodeId())
                .sensorType(reading.getSensorType())
                .title(title)
                .message(message)
                .severity(severity)
                .thresholdValue(threshold)
                .actualValue(actual)
                .build();
        alertRepository.save(alert);
        log.info("Alert created: {} for plant {}", title, reading.getPlantId());
    }

    @Scheduled(fixedRate = 300000)
    @Transactional
    public void checkSensorTimeouts() {
        LocalDateTime threshold = LocalDateTime.now().minusMinutes(sensorTimeoutMinutes);
        markOfflineIfStale(sensorNodeRepository.findByLastReadingAtBeforeAndStatus(threshold, NodeStatus.ACTIVE));

        // Newly paired nodes get extra time before their first reading
        LocalDateTime neverReportedThreshold = LocalDateTime.now().minusMinutes(sensorTimeoutMinutes * 3L);
        markOfflineIfStale(sensorNodeRepository.findByLastReadingAtIsNullAndStatusAndCreatedAtBefore(
                NodeStatus.ACTIVE, neverReportedThreshold));
    }

    private void markOfflineIfStale(List<com.biopower.model.entity.SensorNode> nodes) {
        nodes.forEach(node -> {
                    String title = "Sensor Failure - No Data";
                    if (!alertRepository.existsByPlantIdAndTitleAndStatus(
                            node.getPlant().getPlantId(), title, AlertStatus.ACTIVE)) {
                        Alert alert = Alert.builder()
                                .plantId(node.getPlant().getPlantId())
                                .nodeId(node.getNodeId())
                                .sensorType(node.getSensorType())
                                .title(title)
                                .message(String.format("No data received from %s for %d minutes",
                                        node.getNodeName(), sensorTimeoutMinutes))
                                .severity(AlertSeverity.CRITICAL)
                                .build();
                        alertRepository.save(alert);
                        node.setStatus(NodeStatus.OFFLINE);
                        sensorNodeRepository.save(node);
                    }
                });
    }

    @Transactional(readOnly = true)
    public List<AlertResponse> getAllAlerts() {
        return alertRepository.findAll().stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<AlertResponse> getAlertsByPlant(Long plantId) {
        return alertRepository.findByPlantIdOrderByCreatedAtDesc(plantId).stream()
                .map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<AlertResponse> getAlertsByPlantAndStatus(Long plantId, AlertStatus status) {
        return alertRepository.findByPlantIdAndStatus(plantId, status).stream()
                .map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<AlertResponse> getAlertsByStatus(AlertStatus status) {
        return alertRepository.findByStatus(status).stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional
    public AlertResponse acknowledgeAlert(Long id, Long userId) {
        Alert alert = findAlert(id);
        alert.setStatus(AlertStatus.ACKNOWLEDGED);
        alert.setAcknowledgedBy(userId);
        alert.setAcknowledgedAt(LocalDateTime.now());
        return toResponse(alertRepository.save(alert));
    }

    @Transactional
    public AlertResponse resolveAlert(Long id) {
        Alert alert = findAlert(id);
        alert.setStatus(AlertStatus.RESOLVED);
        alert.setResolvedAt(LocalDateTime.now());
        return toResponse(alertRepository.save(alert));
    }

    private Alert findAlert(Long id) {
        return alertRepository.findById(id)
                .orElseThrow(() -> new com.biopower.exception.ResourceNotFoundException("Alert not found: " + id));
    }

    private AlertResponse toResponse(Alert alert) {
        String plantName = plantRepository.findById(alert.getPlantId())
                .map(p -> p.getPlantName()).orElse("Unknown");
        return AlertResponse.builder()
                .id(alert.getId())
                .plantId(alert.getPlantId())
                .plantName(plantName)
                .nodeId(alert.getNodeId())
                .sensorType(alert.getSensorType())
                .title(alert.getTitle())
                .message(alert.getMessage())
                .severity(alert.getSeverity())
                .status(alert.getStatus())
                .thresholdValue(alert.getThresholdValue())
                .actualValue(alert.getActualValue())
                .createdAt(alert.getCreatedAt())
                .acknowledgedAt(alert.getAcknowledgedAt())
                .resolvedAt(alert.getResolvedAt())
                .build();
    }
}
