package com.biopower.repository;

import com.biopower.model.entity.PartnerApiKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PartnerApiKeyRepository extends JpaRepository<PartnerApiKey, Long> {
    Optional<PartnerApiKey> findByKeyHash(String keyHash);
    List<PartnerApiKey> findByOrganizationIdOrderByCreatedAtDesc(Long organizationId);
}
