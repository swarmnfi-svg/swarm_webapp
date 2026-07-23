package com.biopower.config;

import com.biopower.model.entity.PartnerOrganization;
import com.biopower.model.entity.Plant;
import com.biopower.repository.PartnerOrganizationRepository;
import com.biopower.repository.PlantRepository;
import com.biopower.service.PartnerApiKeyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;

/**
 * Seeds a sandbox partner organization + API key for emPOWER integration testing.
 */
@Component
@Order(100)
@RequiredArgsConstructor
@Slf4j
public class PartnerIntegrationInitializer implements CommandLineRunner {

    public static final String SANDBOX_EXTERNAL_ORG_ID = "org_biopower_pilot";
    public static final String SANDBOX_API_KEY = "swk_sandbox_biopower_dev_2026";

    private final PartnerOrganizationRepository organizationRepository;
    private final PlantRepository plantRepository;
    private final PartnerApiKeyService partnerApiKeyService;

    @Override
    public void run(String... args) {
        if (organizationRepository.findByExternalOrgId(SANDBOX_EXTERNAL_ORG_ID).isPresent()) {
            return;
        }

        List<Plant> plants = plantRepository.findAll();
        PartnerOrganization org = PartnerOrganization.builder()
                .name("BIOPOWER Pilot")
                .externalOrgId(SANDBOX_EXTERNAL_ORG_ID)
                .active(true)
                .allowedPlants(new HashSet<>(plants))
                .build();
        org = organizationRepository.save(org);

        partnerApiKeyService.createApiKeyForOrganization(org, "emPOWER sandbox", SANDBOX_API_KEY);

        log.info("Partner sandbox initialized for emPOWER.");
        log.info("Sandbox organization: {}", SANDBOX_EXTERNAL_ORG_ID);
        log.info("Sandbox API key: {}", SANDBOX_API_KEY);
        log.info("Partner health check: GET /api/partner/v1/health with Authorization: Bearer {}", SANDBOX_API_KEY);
    }
}
