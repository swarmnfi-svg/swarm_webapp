package com.biopower.service;

import com.biopower.dto.request.PartnerApiKeyRequest;
import com.biopower.dto.request.PartnerOrganizationRequest;
import com.biopower.dto.response.PartnerApiKeyCreatedResponse;
import com.biopower.dto.response.PartnerOrganizationResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.PartnerApiKey;
import com.biopower.model.entity.PartnerOrganization;
import com.biopower.model.entity.Plant;
import com.biopower.repository.PartnerApiKeyRepository;
import com.biopower.repository.PartnerOrganizationRepository;
import com.biopower.repository.PlantRepository;
import com.biopower.security.PartnerPrincipal;
import com.biopower.util.ApiKeyHasher;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PartnerApiKeyService {

    private final PartnerOrganizationRepository organizationRepository;
    private final PartnerApiKeyRepository apiKeyRepository;
    private final PlantRepository plantRepository;

    @Transactional
    public Optional<PartnerPrincipal> authenticate(String rawKey) {
        if (rawKey == null || rawKey.isBlank()) {
            return Optional.empty();
        }
        String hash = ApiKeyHasher.hash(rawKey.trim());
        Optional<PartnerApiKey> keyOpt = apiKeyRepository.findByKeyHash(hash).filter(PartnerApiKey::isUsable);
        if (keyOpt.isEmpty()) {
            return Optional.empty();
        }
        PartnerApiKey key = keyOpt.get();
        key.setLastUsedAt(LocalDateTime.now());
        apiKeyRepository.save(key);
        PartnerOrganization org = key.getOrganization();
        if (!org.isActive()) {
            return Optional.empty();
        }
        Set<Long> plantIds = org.getAllowedPlants().stream()
                .map(Plant::getPlantId)
                .collect(Collectors.toSet());
        return Optional.of(new PartnerPrincipal(
                org.getId(),
                org.getExternalOrgId(),
                org.getName(),
                key.getId(),
                plantIds
        ));
    }

    @Transactional
    public PartnerOrganizationResponse createOrganization(PartnerOrganizationRequest request) {
        if (organizationRepository.existsByExternalOrgId(request.getExternalOrgId())) {
            throw new BadRequestException("Organization already exists: " + request.getExternalOrgId());
        }
        PartnerOrganization org = PartnerOrganization.builder()
                .name(request.getName().trim())
                .externalOrgId(request.getExternalOrgId().trim())
                .active(true)
                .allowedPlants(resolvePlants(request.getPlantIds()))
                .build();
        return toOrganizationResponse(organizationRepository.save(org));
    }

    @Transactional
    public PartnerApiKeyCreatedResponse createApiKey(PartnerApiKeyRequest request) {
        PartnerOrganization org = organizationRepository.findById(request.getOrganizationId())
                .orElseThrow(() -> new ResourceNotFoundException("Partner organization not found"));
        String rawKey = ApiKeyHasher.generateRawKey(request.getName());
        PartnerApiKey apiKey = PartnerApiKey.builder()
                .organization(org)
                .name(request.getName().trim())
                .keyHash(ApiKeyHasher.hash(rawKey))
                .keyPrefix(ApiKeyHasher.prefixFor(rawKey))
                .active(true)
                .build();
        PartnerApiKey saved = apiKeyRepository.save(apiKey);
        return PartnerApiKeyCreatedResponse.builder()
                .id(saved.getId())
                .organizationId(org.getId())
                .name(saved.getName())
                .keyPrefix(saved.getKeyPrefix())
                .apiKey(rawKey)
                .createdAt(saved.getCreatedAt())
                .build();
    }

    @Transactional
    public PartnerApiKeyCreatedResponse createApiKeyForOrganization(PartnerOrganization org, String name, String rawKey) {
        PartnerApiKey apiKey = PartnerApiKey.builder()
                .organization(org)
                .name(name)
                .keyHash(ApiKeyHasher.hash(rawKey))
                .keyPrefix(ApiKeyHasher.prefixFor(rawKey))
                .active(true)
                .build();
        PartnerApiKey saved = apiKeyRepository.save(apiKey);
        return PartnerApiKeyCreatedResponse.builder()
                .id(saved.getId())
                .organizationId(org.getId())
                .name(saved.getName())
                .keyPrefix(saved.getKeyPrefix())
                .apiKey(rawKey)
                .createdAt(saved.getCreatedAt())
                .build();
    }

    @Transactional
    public void revokeApiKey(Long keyId) {
        PartnerApiKey key = apiKeyRepository.findById(keyId)
                .orElseThrow(() -> new ResourceNotFoundException("API key not found"));
        key.setActive(false);
        key.setRevokedAt(LocalDateTime.now());
        apiKeyRepository.save(key);
    }

    @Transactional(readOnly = true)
    public List<PartnerOrganizationResponse> listOrganizations() {
        return organizationRepository.findAll().stream()
                .map(this::toOrganizationResponse)
                .collect(Collectors.toList());
    }

    private Set<Plant> resolvePlants(List<Long> plantIds) {
        if (plantIds == null || plantIds.isEmpty()) {
            return new HashSet<>();
        }
        List<Plant> plants = plantRepository.findAllById(plantIds);
        if (plants.size() != plantIds.size()) {
            throw new BadRequestException("One or more plant IDs are invalid");
        }
        return new HashSet<>(plants);
    }

    private PartnerOrganizationResponse toOrganizationResponse(PartnerOrganization org) {
        return PartnerOrganizationResponse.builder()
                .id(org.getId())
                .name(org.getName())
                .externalOrgId(org.getExternalOrgId())
                .active(org.isActive())
                .plantIds(org.getAllowedPlants().stream().map(Plant::getPlantId).toList())
                .createdAt(org.getCreatedAt())
                .build();
    }
}
