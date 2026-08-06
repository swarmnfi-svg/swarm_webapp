package com.biopower.controller;

import com.biopower.config.DeploymentRoleProperties;
import com.biopower.config.IdentityProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class HealthController {

    private final IdentityProperties identityProperties;
    private final DeploymentRoleProperties deploymentRoleProperties;

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "UP");
        body.put("identityMode", identityProperties.getMode());
        body.put("deploymentRole", deploymentRoleProperties.getRole());
        return ResponseEntity.ok(body);
    }
}
