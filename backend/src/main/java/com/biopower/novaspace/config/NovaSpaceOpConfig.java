package com.biopower.novaspace.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(NovaSpaceOpProperties.class)
public class NovaSpaceOpConfig {
}
