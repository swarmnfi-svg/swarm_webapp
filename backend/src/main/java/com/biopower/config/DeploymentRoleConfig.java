package com.biopower.config;

import com.biopower.novaspace.config.NovaSpaceOpProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
@EnableConfigurationProperties(DeploymentRoleProperties.class)
public class DeploymentRoleConfig {

    public DeploymentRoleConfig(
            DeploymentRoleProperties deploymentRole,
            NovaSpaceOpProperties novaSpaceOpProperties,
            Environment environment) {
        if (deploymentRole.isStandby() && !environment.containsProperty("NOVA_THINK_ENABLED")) {
            novaSpaceOpProperties.getThink().setEnabled(false);
        }
    }
}
