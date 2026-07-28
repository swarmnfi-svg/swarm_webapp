package com.biopower.config;

import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.entity.SensorReading;
import com.biopower.model.enums.NodeStatus;
import com.biopower.model.enums.SensorType;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.repository.SensorReadingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Ensures P&ID instrument demo sensors exist on the Tata Steel plant (idempotent).
 */
@Component
@Order(3)
@RequiredArgsConstructor
@Slf4j
public class TataSteelSensorSync implements CommandLineRunner {

    private final PlantRepository plantRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final SensorReadingRepository sensorReadingRepository;

    @Override
    @Transactional
    public void run(String... args) {
        plantRepository.findAll().stream()
                .filter(p -> p.getPlantName() != null
                        && p.getPlantName().contains(TataSteelDemoInitializer.DEMO_PLANT_NAME))
                .findFirst()
                .ifPresent(this::syncInstruments);
    }

    private void syncInstruments(Plant plant) {
        List<SensorDef> required = List.of(
                new SensorDef("FIT-101", "FIT-101 Raw Water Inlet Flow", SensorType.FLOW_TRANSMITTER, "SW-RIO-01", 4.2),
                new SensorDef("LIT-101", "LIT-101 T-102 Level", SensorType.LIQUID_LEVEL, "SW-RIO-01", 58.0),
                new SensorDef("TIT-101", "TIT-101 T-102 Temperature", SensorType.TEMPERATURE_TRANSMITTER, "SW-RIO-01", 42.5),
                new SensorDef("FIT-102", "FIT-102 Slurry Feed Flow", SensorType.FLOW_TRANSMITTER, "SW-RIO-01", 8.6),
                new SensorDef("LIT-103", "LIT-103 D-101 Slurry Level", SensorType.LIQUID_LEVEL, "SW-RIO-02", 72.5),
                new SensorDef("PIT-103", "PIT-103 D-101 Gas Space Pressure", SensorType.PRESSURE_TRANSMITTER, "SW-RIO-02", 1.45),
                new SensorDef("TIT-103A", "TIT-103A D-101 Temperature", SensorType.TEMPERATURE_TRANSMITTER, "SW-RIO-02", 39.8),
                new SensorDef("TIT-103B", "TIT-103B D-101 Temperature", SensorType.TEMPERATURE_TRANSMITTER, "SW-RIO-02", 40.2),
                new SensorDef("AIT-103", "AIT-103 D-101 Slurry pH", SensorType.PH, "SW-RIO-02", 7.18),
                new SensorDef("LIT-201", "LIT-201 T-105 Slurry Storage Level", SensorType.LIQUID_LEVEL, "SW-RIO-03", 61.0),
                new SensorDef("FIT-201", "FIT-201 Slurry Flow after P-102", SensorType.FLOW_TRANSMITTER, "SW-RIO-03", 2.4),
                new SensorDef("PIT-202", "PIT-202 Gas Header Pressure", SensorType.PRESSURE_TRANSMITTER, "SW-RIO-04", 1.2),
                new SensorDef("PDT-201", "PDT-201 Scrubber S-101 Differential Pressure", SensorType.PRESSURE, "SW-RIO-04", 0.38),
                new SensorDef("AIT-201", "AIT-201 Biogas H2S", SensorType.HYDROGEN_SULFIDE, "SW-RIO-04", 42.0),
                new SensorDef("AIT-202", "AIT-202 Treated Biogas CH4", SensorType.METHANE, "SW-RIO-04", 58.6),
                new SensorDef("FIT-202", "FIT-202 Treated Biogas Header Flow", SensorType.FLOW_TRANSMITTER, "SW-RIO-04", 9.6),
                new SensorDef("LIT-301", "LIT-301 Gas Balloon Level", SensorType.LIQUID_LEVEL, "SW-RIO-04", 62.0),
                new SensorDef("FIT-301", "FIT-301 Biogas to GE-101 Flow", SensorType.GAS_FLOW, "SW-RIO-04", 10.2),
                new SensorDef("AIT-302", "AIT-302 Flare FA-101 Feed", SensorType.METHANE, "SW-RIO-04", 12.5)
        );

        Long plantId = plant.getPlantId();
        var existing = sensorNodeRepository.findByPlantPlantId(plantId);
        int added = 0;
        for (SensorDef def : required) {
            boolean hasTag = existing.stream()
                    .anyMatch(n -> n.getNodeName() != null
                            && n.getNodeName().toUpperCase().startsWith(def.tagPrefix().toUpperCase()));
            if (hasTag) {
                continue;
            }
            SensorNode node = sensorNodeRepository.save(SensorNode.builder()
                    .plant(plant)
                    .nodeName(def.name())
                    .sensorType(def.type())
                    .deviceChipId(def.rio())
                    .firmwareVersion("SWARM-RT-1.0")
                    .batteryLevel(100)
                    .signalStrength(95)
                    .status(NodeStatus.ACTIVE)
                    .lastReadingAt(LocalDateTime.now())
                    .build());
            seedReading(plantId, node, def.baseline());
            added++;
        }
        if (added > 0) {
            log.info("Tata Steel P&ID instrument sensors: added {} missing node(s)", added);
        }
    }

    private void seedReading(Long plantId, SensorNode node, double baseline) {
        sensorReadingRepository.save(SensorReading.builder()
                .plantId(plantId)
                .nodeId(node.getNodeId())
                .sensorType(node.getSensorType())
                .value(baseline)
                .recordedAt(LocalDateTime.now())
                .build());
    }

    private record SensorDef(String tagPrefix, String name, SensorType type, String rio, double baseline) {}
}
