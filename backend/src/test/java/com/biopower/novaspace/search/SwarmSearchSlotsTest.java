package com.biopower.novaspace.search;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SwarmSearchSlotsTest {

    @Test
    void detectsPhTelemetryIntent() {
        SwarmSearchSlots slots = SwarmSearchSlots.parse("What is the pH?", 1L);
        assertEquals("telemetry", slots.intent());
        assertEquals("telemetry.latest", slots.primaryToolId());
        assertNotNull(slots.sensorType());
        assertEquals("PH", slots.sensorType().name());
    }

    @Test
    void detectsPlantInventoryIntent() {
        SwarmSearchSlots slots = SwarmSearchSlots.parse("How many plants are connected", null);
        assertEquals("plant_inventory", slots.intent());
        assertEquals("plant.inventory", slots.primaryToolId());
        assertFalse(slots.isPlantScoped());
    }

    @Test
    void detectsPlantHealthAnalyser() {
        SwarmSearchSlots slots = SwarmSearchSlots.parse("How healthy is the plant today?", null);
        assertEquals("plant_health", slots.intent());
        assertEquals("space.analyser", slots.primaryToolId());
    }
}
