package com.biopower.service;

import com.biopower.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PlantAccessService {

    public boolean isSuperAdmin(UserPrincipal principal) {
        return principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_SUPER_ADMIN"));
    }

    public boolean isPlantAdmin(UserPrincipal principal) {
        return principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_PLANT_ADMIN"));
    }

    public boolean isOperator(UserPrincipal principal) {
        return principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_OPERATOR"));
    }

    public boolean canManageUsers(UserPrincipal principal) {
        return isSuperAdmin(principal) || isPlantAdmin(principal);
    }

    public void assertCanAccessPlant(UserPrincipal principal, Long plantId) {
        if (isSuperAdmin(principal)) {
            return;
        }
        if (plantId == null || !principal.getPlantIds().contains(plantId)) {
            throw new AccessDeniedException("You do not have access to this plant");
        }
    }

    public boolean shouldFilterSensorsForOperator(UserPrincipal principal) {
        return isOperator(principal)
                && principal.getNodeIds() != null
                && !principal.getNodeIds().isEmpty();
    }
}
