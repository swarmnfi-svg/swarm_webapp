package com.biopower.config;

import com.biopower.service.SettingsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInitializer implements CommandLineRunner {

    private final SettingsService settingsService;

    @Override
    public void run(String... args) {
        settingsService.initializeDefaults();
        log.debug("System settings initialized.");
    }
}
