package com.biopower.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Pi ddl-auto can create MySQL ENUM columns with lowercase values (e.g. flow_transmitter).
 * Java enums use FLOW_TRANSMITTER — migrate to VARCHAR and normalize case before HMI reads.
 */
@Component
@Order(0)
@RequiredArgsConstructor
@Slf4j
public class HmiEquipmentKindColumnMigration implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        migrateColumn("hmi_equipment", "equipment_kind", 64, false);
        migrateColumn("hmi_equipment", "zone", 64, false);
    }

    private void migrateColumn(String table, String column, int length, boolean nullable) {
        try {
            String nullSql = nullable ? "NULL" : "NOT NULL";
            jdbcTemplate.execute(
                    "ALTER TABLE " + table + " MODIFY COLUMN " + column + " VARCHAR(" + length + ") " + nullSql);
            jdbcTemplate.execute(
                    "UPDATE " + table + " SET " + column + " = UPPER(" + column + ") WHERE " + column + " IS NOT NULL");
            log.info("Migrated {}.{} to VARCHAR({}) {}", table, column, length, nullSql);
        } catch (Exception e) {
            log.debug("Skip {}.{} migration: {}", table, column, e.getMessage());
        }
    }
}
