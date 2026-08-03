package com.biopower.novaspace.permissions;

import com.biopower.security.UserPrincipal;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class NovaToolPermissionServiceTest {

    private final NovaToolPermissionService service = new NovaToolPermissionService();

    @Test
    void operatorCanRunReadTools() {
        UserPrincipal op = principal("OPERATOR", 1L);
        assertTrue(service.canRunTool(op, "telemetry.latest"));
        assertTrue(service.canRunTool(op, "space.analyser"));
    }

    @Test
    void unknownToolDenied() {
        UserPrincipal admin = principal("SUPER_ADMIN", 1L);
        assertFalse(service.canRunTool(admin, "hmi.command.execute"));
        assertFalse(service.canRunTool(admin, "free.sql"));
    }

    @Test
    void nullPrincipalDenied() {
        assertFalse(service.canRunTool(null, "telemetry.latest"));
    }

    private UserPrincipal principal(String role, Long id) {
        return new UserPrincipal(id, "Test User", "test@example.com", "hash",
                List.of(new SimpleGrantedAuthority("ROLE_" + role)),
                true, List.of(1L), List.of());
    }
}
