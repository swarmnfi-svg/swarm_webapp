package com.biopower.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "biopower.deployment")
public class DeploymentRoleProperties {

    /** {@code primary} (default) or {@code standby} (Railway warm standby). */
    private String role = "primary";

    public boolean isPrimary() {
        return !isStandby();
    }

    public boolean isStandby() {
        return "standby".equalsIgnoreCase(role);
    }
}
