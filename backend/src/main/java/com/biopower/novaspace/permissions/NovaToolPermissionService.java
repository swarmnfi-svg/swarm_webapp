package com.biopower.novaspace.permissions;

import com.biopower.novaspace.skills.NovaToolIds;
import com.biopower.security.UserPrincipal;
import org.springframework.stereotype.Service;

import java.util.Set;

/**
 * RBAC floor for Nova catalog tools — never fail-open.
 */
@Service
public class NovaToolPermissionService {

    private static final Set<String> READ_TOOLS = Set.of(
            NovaToolIds.TELEMETRY_LATEST,
            NovaToolIds.TELEMETRY_HISTORY,
            NovaToolIds.PLANT_DASHBOARD,
            NovaToolIds.PLANT_ALERTS,
            NovaToolIds.PLANT_AI_RECOMMENDATIONS,
            NovaToolIds.PLANT_MAINTENANCE,
            NovaToolIds.SPACE_ANALYSER,
            NovaToolIds.SPACE_TREND,
            NovaToolIds.PLANT_INVENTORY
    );

    public boolean canRunTool(UserPrincipal principal, String toolId) {
        if (principal == null || toolId == null || !READ_TOOLS.contains(toolId)) {
            return false;
        }
        return principal.getAuthorities().stream().anyMatch(a ->
                a.getAuthority().equals("ROLE_SUPER_ADMIN")
                        || a.getAuthority().equals("ROLE_PLANT_ADMIN")
                        || a.getAuthority().equals("ROLE_OPERATOR"));
    }

    public boolean isRegisteredReadTool(String toolId) {
        return READ_TOOLS.contains(toolId);
    }
}
