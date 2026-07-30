package com.biopower.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * MySQL ENUM columns for sensor_type reject newer values (e.g. TEMPERATURE_TRANSMITTER).
 * Migrate to VARCHAR so Tata Steel demo seeding works on Railway.
 */
@Component
@Order(0)
@RequiredArgsConstructor
@Slf4j
public class SensorTypeColumnMigration implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        migrateNotNull("sensor_nodes");
        migrateNotNull("sensor_readings");
        migrateNullable("alerts");
    }

    private void migrateNotNull(String table) {
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE " + table + " MODIFY COLUMN sensor_type VARCHAR(50) NOT NULL");
            log.info("Migrated {}.sensor_type to VARCHAR(50) NOT NULL", table);
        } catch (Exception e) {
            log.debug("Skip {}.sensor_type migration: {}", table, e.getMessage());
        }
    }

    private void migrateNullable(String table) {
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE " + table + " MODIFY COLUMN sensor_type VARCHAR(50) NULL");
            log.info("Migrated {}.sensor_type to VARCHAR(50) NULL", table);
        } catch (Exception e) {
            log.debug("Skip {}.sensor_type migration: {}", table, e.getMessage());
        }
    }
}
