package com.biopower.repository;

import com.biopower.model.entity.PartnerOrganization;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PartnerOrganizationRepository extends JpaRepository<PartnerOrganization, Long> {
    Optional<PartnerOrganization> findByExternalOrgId(String externalOrgId);
    boolean existsByExternalOrgId(String externalOrgId);
}
