package com.biopower.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DeploymentRolePropertiesTest {

    @Test
    void defaultsToPrimary() {
        DeploymentRoleProperties props = new DeploymentRoleProperties();
        assertTrue(props.isPrimary());
        assertFalse(props.isStandby());
    }

    @Test
    void recognizesStandbyRole() {
        DeploymentRoleProperties props = new DeploymentRoleProperties();
        props.setRole("standby");
        assertFalse(props.isPrimary());
        assertTrue(props.isStandby());
    }
}
