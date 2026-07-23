package com.biopower.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "biopower.identity")
@Getter
@Setter
public class IdentityProperties {

    /**
     * local = SWARM-owned users table (BIOPOWER on-prem / dev default).
     * saas = emPOWER SaaS identity at accounts.empowerapp.in (consumer only).
     */
    private String mode = "local";

    public boolean isSaasMode() {
        return "saas".equalsIgnoreCase(mode);
    }
}
