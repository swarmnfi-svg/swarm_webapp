package com.biopower.config;

import com.biopower.repository.PlantRepository;
import com.biopower.service.HmiPlantSetupService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(4)
@ConditionalOnProperty(name = "biopower.deployment.role", havingValue = "primary", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class HmiEquipmentSeeder implements CommandLineRunner {

    private final PlantRepository plantRepository;
    private final HmiPlantSetupService hmiPlantSetupService;

    @Override
    public void run(String... args) {
        plantRepository.findAll().stream()
                .filter(hmiPlantSetupService::supportsHmi)
                .forEach(plant -> hmiPlantSetupService.seedIfNeeded(plant.getPlantId()));
    }
}
