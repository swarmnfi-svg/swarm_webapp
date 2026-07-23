package com.biopower.config;

import com.biopower.model.entity.*;
import com.biopower.model.enums.*;
import com.biopower.repository.*;
import com.biopower.service.PredictiveMaintenanceService;
import com.biopower.service.SettingsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PlantRepository plantRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final SensorReadingRepository sensorReadingRepository;
    private final PasswordEncoder passwordEncoder;
    private final SettingsService settingsService;
    private final PredictiveMaintenanceService predictiveMaintenanceService;

    @Override
    public void run(String... args) {
        settingsService.initializeDefaults();
        if (userRepository.count() > 0) {
            log.info("Database already contains data — skipping sample data seed.");
            return;
        }

        log.info("Initializing sample data...");

        Plant plant1 = plantRepository.save(Plant.builder()
                .plantName("Green Valley Biogas Plant")
                .plantType(PlantType.BIOGAS)
                .location("Pune, Maharashtra")
                .capacity(500.0)
                .feedstockType("Cattle Manure, Food Waste")
                .installationDate(LocalDate.of(2022, 3, 15))
                .status(PlantStatus.ACTIVE)
                .build());

        Plant plant2 = plantRepository.save(Plant.builder()
                .plantName("EcoCNG Bio-CNG Facility")
                .plantType(PlantType.BIO_CNG)
                .location("Nashik, Maharashtra")
                .capacity(300.0)
                .feedstockType("Agricultural Residue")
                .installationDate(LocalDate.of(2023, 6, 1))
                .status(PlantStatus.ACTIVE)
                .build());

        User admin = userRepository.save(User.builder()
                .name("Super Admin")
                .email("admin@biopower.com")
                .mobile("+919876543210")
                .password(passwordEncoder.encode("admin123"))
                .role(UserRole.SUPER_ADMIN)
                .status(UserStatus.ACTIVE)
                .assignedPlants(new HashSet<>(List.of(plant1, plant2)))
                .build());

        userRepository.save(User.builder()
                .name("Plant Manager")
                .email("manager@biopower.com")
                .mobile("+919876543211")
                .password(passwordEncoder.encode("manager123"))
                .role(UserRole.PLANT_ADMIN)
                .status(UserStatus.ACTIVE)
                .assignedPlants(new HashSet<>(Set.of(plant1)))
                .build());

        userRepository.save(User.builder()
                .name("Plant Operator")
                .email("operator@biopower.com")
                .mobile("+919876543212")
                .password(passwordEncoder.encode("operator123"))
                .role(UserRole.OPERATOR)
                .status(UserStatus.ACTIVE)
                .assignedPlants(new HashSet<>(Set.of(plant1)))
                .build());

        createSensorNodes(plant1);
        createSensorNodes(plant2);
        generateSampleReadings(plant1.getPlantId());
        predictiveMaintenanceService.generatePredictionsForPlant(plant1.getPlantId());
        predictiveMaintenanceService.generatePredictionsForPlant(plant2.getPlantId());

        log.info("Sample data initialized. Admin login: admin@biopower.com / admin123");
    }

    private void createSensorNodes(Plant plant) {
        SensorType[] types = {SensorType.PH, SensorType.TEMPERATURE, SensorType.PRESSURE,
                SensorType.GAS_FLOW, SensorType.METHANE, SensorType.CARBON_DIOXIDE,
                SensorType.HYDROGEN_SULFIDE, SensorType.AMMONIA};
        for (int i = 0; i < types.length; i++) {
            sensorNodeRepository.save(SensorNode.builder()
                    .plant(plant)
                    .nodeName(types[i].name() + " Node " + (i + 1))
                    .sensorType(types[i])
                    .firmwareVersion("v2.1.0")
                    .batteryLevel(75 + i * 3)
                    .signalStrength(80 + i * 2)
                    .status(NodeStatus.ACTIVE)
                    .lastReadingAt(LocalDateTime.now())
                    .build());
        }
    }

    private void generateSampleReadings(Long plantId) {
        List<SensorNode> nodes = sensorNodeRepository.findByPlantPlantId(plantId);
        LocalDateTime now = LocalDateTime.now();
        double[][] values = {
                {7.2}, {38.5}, {1.8}, {12.5}, {62.0}, {35.0}, {15.0}, {8.0}
        };
        for (int i = 0; i < nodes.size() && i < values.length; i++) {
            SensorNode node = nodes.get(i);
            for (int h = 24; h >= 0; h--) {
                double variance = (Math.random() - 0.5) * 0.5;
                sensorReadingRepository.save(SensorReading.builder()
                        .plantId(plantId)
                        .nodeId(node.getNodeId())
                        .sensorType(node.getSensorType())
                        .value(values[i][0] + variance)
                        .recordedAt(now.minusHours(h))
                        .build());
            }
        }
    }
}
