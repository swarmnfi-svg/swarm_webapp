package com.biopower.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "biopower.identity.saas")
@Getter
@Setter
public class EmpowerSaaSAuthProperties {

    /** emPOWER SaaS identity host — accounts.empowerapp.in */
    private String accountsUrl = "https://accounts.empowerapp.in";

    /** OAuth client id registered with emPOWER SaaS */
    private String clientId = "swarm_webapp";

    /** Server-side secret for code exchange */
    private String clientSecret = "";

    /** This app's public URL (callback target) */
    private String appUrl = "http://localhost:3000";

    /** Token exchange path on SaaS (relative to accountsUrl) */
    private String tokenPath = "/api/oauth/token";
}
