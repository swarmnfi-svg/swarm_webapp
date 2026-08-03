package com.biopower.novaspace.skills.impl;

import com.biopower.dto.response.DashboardResponse;
import com.biopower.model.entity.Plant;
import com.biopower.model.enums.SensorType;
import com.biopower.novaspace.facts.*;
import com.biopower.novaspace.skills.NovaSkill;
import com.biopower.novaspace.skills.NovaSkillContext;
import com.biopower.novaspace.skills.NovaSkillResult;
import com.biopower.novaspace.skills.NovaToolIds;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.repository.SensorReadingRepository;
import com.biopower.service.PlantAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class TelemetryLatestSkill implements NovaSkill {

    private final PlantAccessService plantAccessService;
    private final PlantRepository plantRepository;
    private final SensorReadingRepository sensorReadingRepository;
    private final SensorNodeRepository sensorNodeRepository;

    @Override
    public String toolId() {
        return NovaToolIds.TELEMETRY_LATEST;
    }

    @Override
    public NovaSkillResult execute(NovaSkillContext ctx) {
        if (ctx.plantId() == null || ctx.sensorType() == null) {
            return NovaSkillResult.empty();
        }
        plantAccessService.assertCanAccessPlant(ctx.principal(), ctx.plantId());
        Plant plant = plantRepository.findById(ctx.plantId()).orElse(null);
        String plantName = plant != null ? plant.getPlantName() : "Plant";

        var latest = sensorReadingRepository
                .findFirstByPlantIdAndSensorTypeOrderByRecordedAtDesc(ctx.plantId(), ctx.sensorType());
        if (latest.isEmpty()) {
            return NovaSkillResult.success(FactPack.builder()
                    .metrics(List.of(MetricFact.builder()
                            .metric(ctx.sensorType().name())
                            .quality(QualityFlag.MISSING)
                            .plantId(ctx.plantId())
                            .plantName(plantName)
                            .note("No recent reading for " + ctx.sensorType().name())
                            .build()))
                    .links(List.of(dashboardLink(ctx.plantId())))
                    .periodLabel("latest")
                    .summaryNote("Telemetry incomplete")
                    .build());
        }

        var reading = latest.get();
        String nodeName = sensorNodeRepository.findById(reading.getNodeId())
                .map(n -> n.getNodeName()).orElse("Sensor " + reading.getNodeId());

        MetricFact fact = MetricFact.builder()
                .metric(ctx.sensorType().name())
                .value(reading.getValue())
                .unit(unitFor(ctx.sensorType()))
                .quality(QualityFlag.GOOD)
                .plantId(ctx.plantId())
                .plantName(plantName)
                .nodeId(reading.getNodeId())
                .nodeName(nodeName)
                .recordedAt(reading.getRecordedAt().atZone(ZoneOffset.UTC).toInstant())
                .build();

        return NovaSkillResult.success(FactPack.builder()
                .metrics(List.of(fact))
                .links(List.of(dashboardLink(ctx.plantId())))
                .periodLabel("latest")
                .build());
    }

    static String unitFor(SensorType type) {
        return switch (type) {
            case PH -> "pH";
            case TEMPERATURE, TEMPERATURE_TRANSMITTER -> "°C";
            case PRESSURE, PRESSURE_TRANSMITTER -> "bar";
            case GAS_FLOW, FLOW_TRANSMITTER -> "m³/h";
            case METHANE, CARBON_DIOXIDE, HUMIDITY, LIQUID_LEVEL -> "%";
            case HYDROGEN_SULFIDE, AMMONIA -> "ppm";
        };
    }

    static ProvenanceLink dashboardLink(Long plantId) {
        return new ProvenanceLink("Dashboard", "/dashboard?plantId=" + plantId, NovaToolIds.TELEMETRY_LATEST);
    }
}
