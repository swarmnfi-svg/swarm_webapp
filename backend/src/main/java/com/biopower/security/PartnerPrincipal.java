package com.biopower.security;

import lombok.Getter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.Collection;
import java.util.List;
import java.util.Set;

@Getter
public class PartnerPrincipal implements Authentication {

    private final Long organizationId;
    private final String externalOrgId;
    private final String organizationName;
    private final Long apiKeyId;
    private final Set<Long> allowedPlantIds;
    private boolean authenticated = true;

    public PartnerPrincipal(Long organizationId,
                            String externalOrgId,
                            String organizationName,
                            Long apiKeyId,
                            Set<Long> allowedPlantIds) {
        this.organizationId = organizationId;
        this.externalOrgId = externalOrgId;
        this.organizationName = organizationName;
        this.apiKeyId = apiKeyId;
        this.allowedPlantIds = allowedPlantIds;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_PARTNER"));
    }

    @Override
    public Object getCredentials() {
        return null;
    }

    @Override
    public Object getDetails() {
        return null;
    }

    @Override
    public Object getPrincipal() {
        return this;
    }

    @Override
    public boolean isAuthenticated() {
        return authenticated;
    }

    @Override
    public void setAuthenticated(boolean isAuthenticated) throws IllegalArgumentException {
        this.authenticated = isAuthenticated;
    }

    @Override
    public String getName() {
        return externalOrgId;
    }

    public boolean canAccessPlant(Long plantId) {
        return allowedPlantIds == null || allowedPlantIds.isEmpty() || allowedPlantIds.contains(plantId);
    }
}
