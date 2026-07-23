package com.biopower.service;

import com.biopower.dto.partner.*;
import com.biopower.exception.BadRequestException;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.*;
import com.biopower.model.enums.*;
import com.biopower.repository.*;
import com.biopower.security.PartnerPrincipal;
import com.biopower.util.PartnerMetricCatalog;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PartnerTelemetryService {

    private static final int DEFAULT_PAGE_SIZE = 500;
    private static final int MAX_PAGE_SIZE = 2000;
    private static final double EXPECTED_DAILY_READINGS = 144.0;

    private final PlantRepository plantRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final SensorReadingRepository sensorReadingRepository;
    private final AlertRepository alertRepository;
    private final AiRecommendationRepository aiRecommendationRepository;

    @Transactional(readOnly = true)
    public PartnerHealthResponse health(PartnerPrincipal principal) {
        return PartnerHealthResponse.builder()
                .status("ok")
                .apiVersion("v1")
                .organizationId(principal.getExternalOrgId())
                .organizationName(principal.getOrganizationName())
                .serverTime(Instant.now())
                .build();
    }

    @Transactional(readOnly = true)
    public List<PartnerPlantResponse> listPlants(PartnerPrincipal principal) {
        return resolveAccessiblePlants(principal).stream()
                .map(this::toPlantResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<PartnerDeviceResponse> listDevices(PartnerPrincipal principal, Long plantId) {
        List<Plant> plants = resolveAccessiblePlants(principal);
        if (plantId != null) {
            assertPlantAccess(principal, plantId);
            plants = plants.stream().filter(p -> p.getPlantId().equals(plantId)).toList();
        }
        return plants.stream()
                .flatMap(plant -> sensorNodeRepository.findByPlantPlantId(plant.getPlantId()).stream()
                        .map(node -> toDeviceResponse(node, plant.getPlantId())))
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<PartnerReadingResponse> latest(PartnerPrincipal principal, Long plantId, String deviceId) {
        List<Long> plantIds = scopedPlantIds(principal, plantId);
        Long nodeId = deviceId != null ? PartnerMetricCatalog.nodeIdFromDeviceId(deviceId) : null;
        if (deviceId != null && nodeId == null) {
            throw new BadRequestException("Invalid deviceId: " + deviceId);
        }

        List<PartnerReadingResponse> readings = new ArrayList<>();
        for (Long scopedPlantId : plantIds) {
            List<SensorNode> nodes = sensorNodeRepository.findByPlantPlantId(scopedPlantId);
            for (SensorNode node : nodes) {
                if (nodeId != null && !node.getNodeId().equals(nodeId)) {
                    continue;
                }
                sensorReadingRepository.findFirstByNodeIdOrderByRecordedAtDesc(node.getNodeId())
                        .ifPresent(reading -> readings.add(toReadingResponse(reading, node)));
            }
        }
        return readings;
    }

    @Transactional(readOnly = true)
    public PartnerHistoryPageResponse history(PartnerPrincipal principal,
                                              Long plantId,
                                              String deviceId,
                                              String metricType,
                                              String updatedSince,
                                              String cursor,
                                              Integer limit) {
        List<Long> plantIds = scopedPlantIds(principal, plantId);
        Long nodeId = deviceId != null ? PartnerMetricCatalog.nodeIdFromDeviceId(deviceId) : null;
        if (deviceId != null && nodeId == null) {
            throw new BadRequestException("Invalid deviceId: " + deviceId);
        }
        SensorType sensorType = parseSensorType(metricType);
        LocalDateTime updatedSinceTime = parseInstant(updatedSince);
        Cursor decodedCursor = decodeCursor(cursor);
        int pageSize = normalizeLimit(limit);

        List<SensorReading> batch = sensorReadingRepository.findPartnerHistory(
                plantIds,
                plantId,
                nodeId,
                sensorType,
                updatedSinceTime,
                decodedCursor.time(),
                decodedCursor.id(),
                PageRequest.of(0, pageSize + 1)
        );

        boolean hasMore = batch.size() > pageSize;
        List<SensorReading> page = hasMore ? batch.subList(0, pageSize) : batch;
        Map<Long, SensorNode> nodeCache = new HashMap<>();

        List<PartnerReadingResponse> data = page.stream()
                .map(reading -> {
                    SensorNode node = nodeCache.computeIfAbsent(reading.getNodeId(),
                            id -> sensorNodeRepository.findById(id).orElse(null));
                    return toReadingResponse(reading, node);
                })
                .collect(Collectors.toList());

        String nextCursor = null;
        if (hasMore && !page.isEmpty()) {
            SensorReading last = page.get(page.size() - 1);
            nextCursor = encodeCursor(last.getRecordedAt(), last.getId());
        }

        return PartnerHistoryPageResponse.builder()
                .data(data)
                .cursor(nextCursor)
                .hasMore(hasMore)
                .build();
    }

    @Transactional(readOnly = true)
    public List<PartnerAlertResponse> alerts(PartnerPrincipal principal, Long plantId, String status) {
        List<Long> plantIds = scopedPlantIds(principal, plantId);
        AlertStatus alertStatus = status != null ? AlertStatus.valueOf(status.toUpperCase()) : null;

        List<Alert> alerts;
        if (alertStatus != null) {
            alerts = plantIds.stream()
                    .flatMap(id -> alertRepository.findByPlantIdAndStatus(id, alertStatus).stream())
                    .collect(Collectors.toList());
        } else {
            alerts = plantIds.stream()
                    .flatMap(id -> alertRepository.findByPlantIdOrderByCreatedAtDesc(id).stream())
                    .collect(Collectors.toList());
        }

        return alerts.stream()
                .sorted(Comparator.comparing(Alert::getCreatedAt).reversed())
                .map(this::toAlertResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PartnerPlantHealthResponse plantHealth(PartnerPrincipal principal, Long plantId) {
        assertPlantAccess(principal, plantId);
        Plant plant = plantRepository.findById(plantId)
                .orElseThrow(() -> new ResourceNotFoundException("Plant not found"));
        List<SensorNode> nodes = sensorNodeRepository.findByPlantPlantId(plantId);
        long activeNodes = nodes.stream().filter(n -> n.getStatus() == NodeStatus.ACTIVE).count();
        long activeAlerts = alertRepository.countByPlantIdAndStatus(plantId, AlertStatus.ACTIVE);
        int healthScore = aiRecommendationRepository.findFirstByPlantIdOrderByCreatedAtDesc(plantId)
                .map(AiRecommendation::getHealthScore)
                .orElse(85);
        HealthStatus healthStatus = resolveHealthStatus(healthScore);
        List<String> recommendations = aiRecommendationRepository.findByPlantIdOrderByCreatedAtDesc(plantId).stream()
                .limit(3)
                .map(AiRecommendation::getRecommendation)
                .collect(Collectors.toList());

        return PartnerPlantHealthResponse.builder()
                .plantId(String.valueOf(plantId))
                .plantName(plant.getPlantName())
                .healthScore(healthScore)
                .healthStatus(healthStatus.name())
                .activeAlerts(activeAlerts)
                .activeDevices(activeNodes)
                .totalDevices((long) nodes.size())
                .lastUpdated(Instant.now())
                .recommendations(recommendations)
                .build();
    }

    @Transactional(readOnly = true)
    public PartnerDailyAggregatePageResponse dailyAggregates(PartnerPrincipal principal,
                                                             Long plantId,
                                                             String deviceId,
                                                             String metricType,
                                                             LocalDate from,
                                                             LocalDate to) {
        if (from == null || to == null) {
            throw new BadRequestException("from and to dates are required (YYYY-MM-DD)");
        }
        if (to.isBefore(from)) {
            throw new BadRequestException("to must be on or after from");
        }

        List<Long> plantIds = scopedPlantIds(principal, plantId);
        Long nodeId = deviceId != null ? PartnerMetricCatalog.nodeIdFromDeviceId(deviceId) : null;
        if (deviceId != null && nodeId == null) {
            throw new BadRequestException("Invalid deviceId: " + deviceId);
        }
        SensorType sensorType = parseSensorType(metricType);

        LocalDateTime start = from.atStartOfDay();
        LocalDateTime end = to.plusDays(1).atStartOfDay().minusNanos(1);

        List<SensorReading> readings = sensorReadingRepository.findPartnerRange(
                plantIds, plantId, nodeId, sensorType, start, end);

        Map<String, List<SensorReading>> grouped = readings.stream()
                .collect(Collectors.groupingBy(r ->
                        r.getPlantId() + "|" + r.getNodeId() + "|" + r.getSensorType() + "|" + r.getRecordedAt().toLocalDate()));

        List<PartnerDailyAggregateResponse> aggregates = grouped.values().stream()
                .map(this::toDailyAggregate)
                .sorted(Comparator.comparing(PartnerDailyAggregateResponse::getDate)
                        .thenComparing(PartnerDailyAggregateResponse::getDeviceId))
                .collect(Collectors.toList());

        return PartnerDailyAggregatePageResponse.builder().data(aggregates).build();
    }

    private PartnerDailyAggregateResponse toDailyAggregate(List<SensorReading> dayReadings) {
        SensorReading first = dayReadings.get(0);
        SensorType type = first.getSensorType();
        ReadingType readingType = PartnerMetricCatalog.readingTypeFor(type);
        List<Double> values = dayReadings.stream().map(SensorReading::getValue).sorted().toList();
        double min = values.get(0);
        double max = values.get(values.size() - 1);
        double avg = values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        double sum = readingType == ReadingType.TOTALIZER
                ? computeTotalizerSum(dayReadings)
                : values.stream().mapToDouble(Double::doubleValue).sum();
        long count = values.size();
        double completeness = Math.min(1.0, count / EXPECTED_DAILY_READINGS);
        String quality = completeness >= 0.8 ? ReadingQuality.MEASURED.name()
                : completeness > 0 ? ReadingQuality.INCOMPLETE.name()
                : ReadingQuality.INCOMPLETE.name();

        return PartnerDailyAggregateResponse.builder()
                .deviceId(PartnerMetricCatalog.deviceIdFor(first.getNodeId()))
                .plantId(String.valueOf(first.getPlantId()))
                .metricType(type.name())
                .unit(PartnerMetricCatalog.unitFor(type))
                .readingType(readingType.name())
                .date(first.getRecordedAt().toLocalDate())
                .min(min)
                .max(max)
                .avg(avg)
                .sum(sum)
                .count(count)
                .completeness(completeness)
                .quality(quality)
                .build();
    }

    private double computeTotalizerSum(List<SensorReading> readings) {
        List<SensorReading> sorted = readings.stream()
                .sorted(Comparator.comparing(SensorReading::getRecordedAt))
                .toList();
        double total = 0;
        for (int i = 1; i < sorted.size(); i++) {
            double delta = sorted.get(i).getValue() - sorted.get(i - 1).getValue();
            if (delta >= 0) {
                total += delta;
            }
        }
        return total;
    }

    private List<Plant> resolveAccessiblePlants(PartnerPrincipal principal) {
        if (principal.getAllowedPlantIds() == null || principal.getAllowedPlantIds().isEmpty()) {
            return plantRepository.findAll();
        }
        return plantRepository.findByPlantIdIn(new ArrayList<>(principal.getAllowedPlantIds()));
    }

    private List<Long> scopedPlantIds(PartnerPrincipal principal, Long plantId) {
        if (plantId != null) {
            assertPlantAccess(principal, plantId);
            return List.of(plantId);
        }
        return resolveAccessiblePlants(principal).stream()
                .map(Plant::getPlantId)
                .collect(Collectors.toList());
    }

    private void assertPlantAccess(PartnerPrincipal principal, Long plantId) {
        if (!principal.canAccessPlant(plantId)) {
            throw new AccessDeniedException("API key cannot access plant " + plantId);
        }
    }

    private PartnerPlantResponse toPlantResponse(Plant plant) {
        return PartnerPlantResponse.builder()
                .plantId(String.valueOf(plant.getPlantId()))
                .name(plant.getPlantName())
                .type(plant.getPlantType().name())
                .status(plant.getStatus().name())
                .location(plant.getLocation())
                .capacity(plant.getCapacity())
                .build();
    }

    private PartnerDeviceResponse toDeviceResponse(SensorNode node, Long plantId) {
        SensorType type = node.getSensorType();
        return PartnerDeviceResponse.builder()
                .deviceId(PartnerMetricCatalog.deviceIdFor(node.getNodeId()))
                .plantId(String.valueOf(plantId))
                .name(node.getNodeName())
                .metricType(type.name())
                .unit(PartnerMetricCatalog.unitFor(type))
                .readingType(PartnerMetricCatalog.readingTypeFor(type).name())
                .status(node.getStatus().name())
                .firmwareVersion(node.getFirmwareVersion())
                .lastReadingAt(node.getLastReadingAt() != null
                        ? node.getLastReadingAt().atZone(ZoneOffset.UTC).toInstant()
                        : null)
                .build();
    }

    private PartnerReadingResponse toReadingResponse(SensorReading reading, SensorNode node) {
        SensorType type = reading.getSensorType();
        return PartnerReadingResponse.builder()
                .deviceId(PartnerMetricCatalog.deviceIdFor(reading.getNodeId()))
                .plantId(String.valueOf(reading.getPlantId()))
                .metricType(type.name())
                .value(reading.getValue())
                .unit(PartnerMetricCatalog.unitFor(type))
                .readingType(PartnerMetricCatalog.readingTypeFor(type).name())
                .quality(ReadingQuality.MEASURED.name())
                .recordedAt(reading.getRecordedAt().atZone(ZoneOffset.UTC).toInstant())
                .build();
    }

    private PartnerAlertResponse toAlertResponse(Alert alert) {
        return PartnerAlertResponse.builder()
                .alertId(String.valueOf(alert.getId()))
                .plantId(String.valueOf(alert.getPlantId()))
                .deviceId(alert.getNodeId() != null ? PartnerMetricCatalog.deviceIdFor(alert.getNodeId()) : null)
                .metricType(alert.getSensorType() != null ? alert.getSensorType().name() : null)
                .title(alert.getTitle())
                .message(alert.getMessage())
                .severity(alert.getSeverity().name())
                .status(alert.getStatus().name())
                .createdAt(alert.getCreatedAt().atZone(ZoneOffset.UTC).toInstant())
                .updatedAt(alert.getUpdatedAt().atZone(ZoneOffset.UTC).toInstant())
                .build();
    }

    private SensorType parseSensorType(String metricType) {
        if (metricType == null || metricType.isBlank()) {
            return null;
        }
        try {
            return SensorType.valueOf(metricType.toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException("Unknown metricType: " + metricType);
        }
    }

    private LocalDateTime parseInstant(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.ofInstant(Instant.parse(value), ZoneOffset.UTC);
        } catch (DateTimeParseException ex) {
            throw new BadRequestException("Invalid updated_since timestamp. Use ISO-8601 UTC.");
        }
    }

    private int normalizeLimit(Integer limit) {
        if (limit == null || limit <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(limit, MAX_PAGE_SIZE);
    }

    private String encodeCursor(LocalDateTime time, Long id) {
        String raw = time.toInstant(ZoneOffset.UTC).toString() + "|" + id;
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    private Cursor decodeCursor(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return new Cursor(null, null);
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            String[] parts = decoded.split("\\|", 2);
            Instant instant = Instant.parse(parts[0]);
            Long id = Long.parseLong(parts[1]);
            return new Cursor(LocalDateTime.ofInstant(instant, ZoneOffset.UTC), id);
        } catch (Exception ex) {
            throw new BadRequestException("Invalid cursor");
        }
    }

    private HealthStatus resolveHealthStatus(int score) {
        if (score >= 90) return HealthStatus.EXCELLENT;
        if (score >= 75) return HealthStatus.GOOD;
        if (score >= 60) return HealthStatus.AVERAGE;
        if (score >= 40) return HealthStatus.POOR;
        return HealthStatus.CRITICAL;
    }

    private record Cursor(LocalDateTime time, Long id) {
    }
}
