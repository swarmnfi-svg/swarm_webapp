package com.biopower.config;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * H2 keeps stale CHECK constraints when {@code HmiEquipmentKind} enum values are extended.
 */
@Component
@Order(0)
@ConditionalOnProperty(name = "biopower.deployment.role", havingValue = "primary", matchIfMissing = true)
@Slf4j
public class HmiSchemaMigration implements CommandLineRunner {

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public void run(String... args) {
        dropCheckConstraints("hmi_equipment");
    }

    @SuppressWarnings("unchecked")
    private void dropCheckConstraints(String tableName) {
        List<String> constraints;
        try {
            constraints = entityManager.createNativeQuery("""
                    SELECT CONSTRAINT_NAME
                    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                    WHERE UPPER(TABLE_NAME) = UPPER(:table)
                      AND CONSTRAINT_TYPE = 'CHECK'
                    """)
                    .setParameter("table", tableName)
                    .getResultList();
        } catch (Exception e) {
            log.trace("Could not list CHECK constraints for {}: {}", tableName, e.getMessage());
            return;
        }

        for (Object row : constraints) {
            dropOne(tableName, String.valueOf(row));
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void dropOne(String tableName, String constraintName) {
        try {
            entityManager.createNativeQuery(
                    "ALTER TABLE " + tableName + " DROP CONSTRAINT IF EXISTS " + constraintName
            ).executeUpdate();
            log.info("Dropped stale H2 check constraint {} on {}", constraintName, tableName);
        } catch (Exception e) {
            log.debug("Could not drop constraint {} on {}: {}", constraintName, tableName, e.getMessage());
        }
    }
}
