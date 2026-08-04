package com.biopower.config;

import com.biopower.model.entity.Plant;
import com.biopower.model.entity.User;
import com.biopower.model.enums.UserRole;
import com.biopower.model.enums.UserStatus;
import com.biopower.repository.*;
import com.biopower.service.SettingsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Removes legacy demo plants/users and ensures the platform SUPER_ADMIN exists.
 */
@Component
@Order(1)
@ConditionalOnProperty(name = "biopower.deployment.role", havingValue = "primary", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class ProductionDataCleanup implements CommandLineRunner {

    public static final String PLATFORM_ADMIN_EMAIL = "swarm.nfi@gmail.com";
    public static final String PLATFORM_ADMIN_PASSWORD = "Swarm@2026";
    private static final String CLEANUP_FLAG = "production.cleanup.v1.done";

    private static final Set<String> LEGACY_USER_EMAILS = Set.of(
            "admin@biopower.com",
            "manager@biopower.com",
            "operator@biopower.com"
    );

    private final PlantRepository plantRepository;
    private final UserRepository userRepository;
    private final SensorReadingRepository sensorReadingRepository;
    private final AlertRepository alertRepository;
    private final AiRecommendationRepository aiRecommendationRepository;
    private final PredictiveMaintenanceRepository predictiveMaintenanceRepository;
    private final ReportRepository reportRepository;
    private final HmiEquipmentRepository hmiEquipmentRepository;
    private final HmiEquipmentStateRepository hmiEquipmentStateRepository;
    private final PasswordEncoder passwordEncoder;
    private final SettingsService settingsService;

    @Override
    @Transactional
    public void run(String... args) {
        boolean firstMigration = !settingsService.getSettingsMap().containsKey(CLEANUP_FLAG);

        removeNonTataPlants();
        removeLegacyUsers();
        ensurePlatformAdmin(firstMigration);

        if (firstMigration) {
            com.biopower.dto.request.SettingsRequest flag = new com.biopower.dto.request.SettingsRequest();
            flag.setSettingKey(CLEANUP_FLAG);
            flag.setSettingValue("true");
            flag.setCategory("SYSTEM");
            flag.setDescription("Production cleanup migrated dummy plants and platform admin");
            settingsService.saveSetting(flag);
            log.info("Production data cleanup completed (first migration).");
        }
    }

    private void removeNonTataPlants() {
        List<Plant> dummyPlants = plantRepository.findAll().stream()
                .filter(p -> !isTataSteelPlant(p))
                .toList();

        for (Plant plant : dummyPlants) {
            Long plantId = plant.getPlantId();
            log.info("Removing legacy demo plant: {}", plant.getPlantName());

            unlinkPlantFromUsers(plant);
            sensorReadingRepository.deleteByPlantId(plantId);
            alertRepository.deleteByPlantId(plantId);
            aiRecommendationRepository.deleteByPlantId(plantId);
            predictiveMaintenanceRepository.deleteByPlantId(plantId);
            reportRepository.deleteByPlantId(plantId);
            hmiEquipmentStateRepository.deleteByPlantId(plantId);
            hmiEquipmentRepository.deleteByPlantId(plantId);
            plantRepository.delete(plant);
        }
    }

    private void unlinkPlantFromUsers(Plant plant) {
        for (User user : userRepository.findAll()) {
            if (user.getAssignedPlants().removeIf(p -> p.getPlantId().equals(plant.getPlantId()))) {
                userRepository.save(user);
            }
        }
    }

    private void removeLegacyUsers() {
        for (String email : LEGACY_USER_EMAILS) {
            userRepository.findByEmail(email).ifPresent(user -> {
                log.info("Removing legacy demo user: {}", email);
                userRepository.delete(user);
            });
        }
    }

    private void ensurePlatformAdmin(boolean setPassword) {
        List<Plant> allPlants = plantRepository.findAll();
        Set<Plant> plantAssignments = new HashSet<>(allPlants);

        userRepository.findByEmail(PLATFORM_ADMIN_EMAIL).ifPresentOrElse(user -> {
            user.setRole(UserRole.SUPER_ADMIN);
            user.setStatus(UserStatus.ACTIVE);
            user.setName("SWARM Admin");
            user.getAssignedPlants().clear();
            user.getAssignedPlants().addAll(plantAssignments);
            if (setPassword) {
                user.setPassword(passwordEncoder.encode(PLATFORM_ADMIN_PASSWORD));
            }
            userRepository.save(user);
            log.info("Platform admin updated: {}", PLATFORM_ADMIN_EMAIL);
        }, () -> {
            User admin = User.builder()
                    .name("SWARM Admin")
                    .email(PLATFORM_ADMIN_EMAIL)
                    .password(passwordEncoder.encode(PLATFORM_ADMIN_PASSWORD))
                    .role(UserRole.SUPER_ADMIN)
                    .status(UserStatus.ACTIVE)
                    .assignedPlants(plantAssignments)
                    .build();
            userRepository.save(admin);
            log.info("Platform admin created: {}", PLATFORM_ADMIN_EMAIL);
        });
    }

    private static boolean isTataSteelPlant(Plant plant) {
        return plant.getPlantName() != null
                && plant.getPlantName().toLowerCase().contains("tata steel");
    }
}
