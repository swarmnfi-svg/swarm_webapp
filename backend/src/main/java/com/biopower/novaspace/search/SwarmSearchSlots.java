package com.biopower.novaspace.search;

import com.biopower.model.enums.SensorType;
import com.biopower.novaspace.skills.NovaToolIds;
import lombok.Builder;

import java.util.Locale;
import java.util.regex.Pattern;

@Builder
public record SwarmSearchSlots(
        String intent,
        String primaryToolId,
        SensorType sensorType,
        Long plantIdHint,
        double confidence,
        String periodLabel
) {
    public static final String INTENT_PLANT_HEALTH = "plant_health";
    public static final String INTENT_TELEMETRY = "telemetry";
    public static final String INTENT_TREND = "trend";
    public static final String INTENT_ALERTS = "alerts";
    public static final String INTENT_PLANT_INVENTORY = "plant_inventory";

    private static final Pattern HEALTH_CUE = Pattern.compile(
            "\\b(healthy|health|how\\s+is|status|doing|unhealthy|plant\\s+health)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern TREND_CUE = Pattern.compile(
            "\\b(trend|over\\s+time|last\\s+\\d+\\s+days?|history|historical)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern ALERT_CUE = Pattern.compile(
            "\\b(alert|alarm|warning|critical)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern PLANT_INVENTORY_CUE = Pattern.compile(
            "\\b(how\\s+many\\s+plants?|plants?\\s+(are\\s+)?(connected|online|available|linked)|"
                    + "list\\s+plants?|which\\s+plants?|number\\s+of\\s+plants?|plants?\\s+connected)\\b",
            Pattern.CASE_INSENSITIVE);

    public static SwarmSearchSlots parse(String query, Long stickyPlantId) {
        String q = query == null ? "" : query.trim();
        if (q.isEmpty()) {
            return SwarmSearchSlots.builder().confidence(0).build();
        }

        SensorType sensor = detectSensorType(q);
        if (sensor != null && TREND_CUE.matcher(q).find()) {
            return SwarmSearchSlots.builder()
                    .intent(INTENT_TREND)
                    .primaryToolId(NovaToolIds.SPACE_TREND)
                    .sensorType(sensor)
                    .plantIdHint(stickyPlantId)
                    .confidence(0.9)
                    .periodLabel("requested window")
                    .build();
        }
        if (sensor != null) {
            return SwarmSearchSlots.builder()
                    .intent(INTENT_TELEMETRY)
                    .primaryToolId(NovaToolIds.TELEMETRY_LATEST)
                    .sensorType(sensor)
                    .plantIdHint(stickyPlantId)
                    .confidence(0.92)
                    .periodLabel("latest")
                    .build();
        }
        if (PLANT_INVENTORY_CUE.matcher(q).find()) {
            return SwarmSearchSlots.builder()
                    .intent(INTENT_PLANT_INVENTORY)
                    .primaryToolId(NovaToolIds.PLANT_INVENTORY)
                    .plantIdHint(stickyPlantId)
                    .confidence(0.93)
                    .periodLabel("current")
                    .build();
        }
        if (HEALTH_CUE.matcher(q).find()) {
            return SwarmSearchSlots.builder()
                    .intent(INTENT_PLANT_HEALTH)
                    .primaryToolId(NovaToolIds.SPACE_ANALYSER)
                    .plantIdHint(stickyPlantId)
                    .confidence(0.88)
                    .periodLabel("today")
                    .build();
        }
        if (ALERT_CUE.matcher(q).find()) {
            return SwarmSearchSlots.builder()
                    .intent(INTENT_ALERTS)
                    .primaryToolId(NovaToolIds.PLANT_ALERTS)
                    .plantIdHint(stickyPlantId)
                    .confidence(0.85)
                    .periodLabel("current")
                    .build();
        }
        return SwarmSearchSlots.builder()
                .intent(INTENT_PLANT_HEALTH)
                .primaryToolId(NovaToolIds.SPACE_ANALYSER)
                .plantIdHint(stickyPlantId)
                .confidence(0.55)
                .periodLabel("today")
                .build();
    }

    public boolean isPlantScoped() {
        return !INTENT_PLANT_INVENTORY.equals(intent);
    }

    private static SensorType detectSensorType(String q) {
        String lower = q.toLowerCase(Locale.ROOT);
        if (lower.contains("ph") || lower.contains("acidity") || lower.contains("alkalinity")) {
            return SensorType.PH;
        }
        if (lower.contains("methane") || lower.contains("ch4")) {
            return SensorType.METHANE;
        }
        if (lower.contains("temperature") || lower.contains("temp")) {
            return SensorType.TEMPERATURE;
        }
        if (lower.contains("pressure")) {
            return SensorType.PRESSURE;
        }
        if (lower.contains("gas flow") || lower.contains("biogas flow")) {
            return SensorType.GAS_FLOW;
        }
        if (lower.contains("h2s") || lower.contains("hydrogen sulfide")) {
            return SensorType.HYDROGEN_SULFIDE;
        }
        if (lower.contains("co2") || lower.contains("carbon dioxide")) {
            return SensorType.CARBON_DIOXIDE;
        }
        if (lower.contains("level")) {
            return SensorType.LIQUID_LEVEL;
        }
        if (lower.contains("flow")) {
            return SensorType.FLOW_TRANSMITTER;
        }
        return null;
    }
}
