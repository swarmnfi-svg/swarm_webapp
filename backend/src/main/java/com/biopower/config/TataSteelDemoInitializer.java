package com.biopower.config;

import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.entity.SensorReading;
import com.biopower.model.entity.User;
import com.biopower.model.enums.NodeStatus;
import com.biopower.model.enums.PlantStatus;
import com.biopower.model.enums.PlantType;
import com.biopower.model.enums.SensorType;
import com.biopower.model.enums.UserRole;
import com.biopower.model.enums.UserStatus;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.repository.SensorReadingRepository;
import com.biopower.repository.UserRepository;
import com.biopower.service.PredictiveMaintenanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Seeds Tata Steel West Bokaro biomethanation demo data (SWM-TSL-WBK-BOD-001, Rev. 0).
 * Idempotent — safe to run on databases that already contain other plants/users.
 */
@Component
@Order(2)
@ConditionalOnProperty(name = "biopower.deployment.role", havingValue = "primary", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class TataSteelDemoInitializer implements CommandLineRunner {

    public static final String DEMO_PLANT_NAME = "Tata Steel West Bokaro Biomethanation Plant";
    public static final String DEMO_ADMIN_EMAIL = "tata.admin@tatasteel.com";
    public static final String DEMO_OPERATOR_EMAIL = "tata.operator@tatasteel.com";
    public static final String DEMO_PASSWORD = "TataSteel@2026";

    private final PlantRepository plantRepository;
    private final UserRepository userRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final SensorReadingRepository sensorReadingRepository;
    private final PasswordEncoder passwordEncoder;
    private final PredictiveMaintenanceService predictiveMaintenanceService;

    @Override
    @Transactional
    public void run(String... args) {
        if (userRepository.existsByEmail(DEMO_ADMIN_EMAIL)) {
            log.debug("Tata Steel demo data already present — skipping seed.");
            return;
        }

        log.info("Initializing Tata Steel West Bokaro demo plant and accounts...");

        Plant plant = plantRepository.save(Plant.builder()
                .plantName(DEMO_PLANT_NAME)
                .plantType(PlantType.BIOGAS)
                .location("West Bokaro, Jharkhand, India")
                .capacity(70.0)
                .feedstockType("Industrial organic waste — pretreatment, digester and slurry handling (P&ID BPG-10-PR-GD-002)")
                .installationDate(LocalDate.of(2026, 7, 23))
                .status(PlantStatus.ACTIVE)
                .enabledSensorTypes(String.join(",",
                        SensorType.PH.name(),
                        SensorType.TEMPERATURE.name(),
                        SensorType.PRESSURE.name(),
                        SensorType.GAS_FLOW.name(),
                        SensorType.METHANE.name(),
                        SensorType.CARBON_DIOXIDE.name(),
                        SensorType.HYDROGEN_SULFIDE.name(),
                        SensorType.LIQUID_LEVEL.name(),
                        SensorType.FLOW_TRANSMITTER.name(),
                        SensorType.PRESSURE_TRANSMITTER.name(),
                        SensorType.TEMPERATURE_TRANSMITTER.name()))
                .build());

        List<SensorSeed> sensors = List.of(
                new SensorSeed("FIT-101 Raw Water Inlet Flow", SensorType.FLOW_TRANSMITTER, "SW-RIO-01", 4.2),
                new SensorSeed("LIT-101 T-102 Level", SensorType.LIQUID_LEVEL, "SW-RIO-01", 58.0),
                new SensorSeed("TIT-101 T-102 Temperature", SensorType.TEMPERATURE_TRANSMITTER, "SW-RIO-01", 42.5),
                new SensorSeed("FIT-102 Slurry Feed Flow", SensorType.FLOW_TRANSMITTER, "SW-RIO-01", 8.6),
                new SensorSeed("LIT-103 D-101 Slurry Level", SensorType.LIQUID_LEVEL, "SW-RIO-02", 72.5),
                new SensorSeed("PIT-103 D-101 Gas Space Pressure", SensorType.PRESSURE_TRANSMITTER, "SW-RIO-02", 1.45),
                new SensorSeed("TIT-103A D-101 Temperature", SensorType.TEMPERATURE_TRANSMITTER, "SW-RIO-02", 39.8),
                new SensorSeed("TIT-103B D-101 Temperature", SensorType.TEMPERATURE_TRANSMITTER, "SW-RIO-02", 40.2),
                new SensorSeed("AIT-103 D-101 Slurry pH", SensorType.PH, "SW-RIO-02", 7.18),
                new SensorSeed("LIT-201 T-105 Slurry Storage Level", SensorType.LIQUID_LEVEL, "SW-RIO-03", 61.0),
                new SensorSeed("FIT-201 Slurry Flow after P-102", SensorType.FLOW_TRANSMITTER, "SW-RIO-03", 2.4),
                new SensorSeed("PIT-202 Slurry Line Pressure", SensorType.PRESSURE_TRANSMITTER, "SW-RIO-03", 0.85),
                new SensorSeed("PDT-201 Scrubber S-101 Differential Pressure", SensorType.PRESSURE, "SW-RIO-04", 0.38),
                new SensorSeed("AIT-201 Biogas H2S", SensorType.HYDROGEN_SULFIDE, "SW-RIO-04", 42.0),
                new SensorSeed("AIT-202 Treated Biogas CH4", SensorType.METHANE, "SW-RIO-04", 58.6),
                new SensorSeed("FIT-202 Treated Biogas Header Flow", SensorType.FLOW_TRANSMITTER, "SW-RIO-04", 9.6),
                new SensorSeed("LIT-301 MT-101 Moisture Trap Level", SensorType.LIQUID_LEVEL, "SW-RIO-04", 38.0),
                new SensorSeed("FIT-301 Biogas to GE-101 Flow", SensorType.GAS_FLOW, "SW-RIO-04", 10.2),
                new SensorSeed("AIT-302 Flare FA-101 Feed", SensorType.METHANE, "SW-RIO-04", 12.5)
        );

        for (SensorSeed seed : sensors) {
            SensorNode node = sensorNodeRepository.save(SensorNode.builder()
                    .plant(plant)
                    .nodeName(seed.name())
                    .sensorType(seed.type())
                    .deviceChipId(seed.rioPanel())
                    .firmwareVersion("SWARM-RT-1.0")
                    .batteryLevel(100)
                    .signalStrength(95)
                    .status(NodeStatus.ACTIVE)
                    .lastReadingAt(LocalDateTime.now())
                    .build());
            generateReadings(plant.getPlantId(), node, seed.baseline());
        }

        userRepository.save(User.builder()
                .name("Tata Steel Plant Admin")
                .email(DEMO_ADMIN_EMAIL)
                .mobile("+919331234567")
                .password(passwordEncoder.encode(DEMO_PASSWORD))
                .role(UserRole.PLANT_ADMIN)
                .status(UserStatus.ACTIVE)
                .assignedPlants(new HashSet<>(Set.of(plant)))
                .build());

        userRepository.save(User.builder()
                .name("Tata Steel Shift Operator")
                .email(DEMO_OPERATOR_EMAIL)
                .mobile("+919331234568")
                .password(passwordEncoder.encode(DEMO_PASSWORD))
                .role(UserRole.OPERATOR)
                .status(UserStatus.ACTIVE)
                .assignedPlants(new HashSet<>(Set.of(plant)))
                .build());

        predictiveMaintenanceService.generatePredictionsForPlant(plant.getPlantId());

        log.info("Tata Steel demo ready — plant: '{}'", DEMO_PLANT_NAME);
        log.info("  Admin:    {} / {}", DEMO_ADMIN_EMAIL, DEMO_PASSWORD);
        log.info("  Operator: {} / {}", DEMO_OPERATOR_EMAIL, DEMO_PASSWORD);
    }

    private void generateReadings(Long plantId, SensorNode node, double baseline) {
        LocalDateTime now = LocalDateTime.now();
        for (int h = 24; h >= 0; h--) {
            double variance = (Math.random() - 0.5) * baseline * 0.04;
            sensorReadingRepository.save(SensorReading.builder()
                    .plantId(plantId)
                    .nodeId(node.getNodeId())
                    .sensorType(node.getSensorType())
                    .value(Math.max(0, baseline + variance))
                    .recordedAt(now.minusHours(h))
                    .build());
        }
    }

    private record SensorSeed(String name, SensorType type, String rioPanel, double baseline) {}
}
