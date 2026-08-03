package com.biopower.novaspace.think;

import com.biopower.model.enums.SensorType;
import com.biopower.novaspace.llm.NovaLlmClient;
import com.biopower.novaspace.search.SwarmSearchSlots;
import com.biopower.novaspace.skills.NovaToolIds;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.Set;

/**
 * Gated NovaThink — only when rules confidence is low; output validated against catalog tools.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class NovaThinkService {

    private static final Set<String> ALLOWED_TOOLS = Set.of(
            NovaToolIds.TELEMETRY_LATEST,
            NovaToolIds.SPACE_TREND,
            NovaToolIds.SPACE_ANALYSER,
            NovaToolIds.PLANT_ALERTS,
            NovaToolIds.PLANT_DASHBOARD,
            NovaToolIds.PLANT_INVENTORY
    );

    private static final Set<String> ALLOWED_INTENTS = Set.of(
            SwarmSearchSlots.INTENT_TELEMETRY,
            SwarmSearchSlots.INTENT_TREND,
            SwarmSearchSlots.INTENT_PLANT_HEALTH,
            SwarmSearchSlots.INTENT_ALERTS,
            SwarmSearchSlots.INTENT_PLANT_INVENTORY
    );

    private final NovaLlmClient llmClient;
    private final ObjectMapper objectMapper;

    public SwarmSearchSlots refine(String query, SwarmSearchSlots rulesSlots, Long stickyPlantId) {
        if (!llmClient.isConfigured()) {
            return rulesSlots;
        }
        String system = """
                You are NovaThink for SWARM plant telemetry. Return ONLY valid JSON with keys:
                intent, primaryToolId, sensorType (or null), confidence (0-1).
                Allowed intents: plant_health, telemetry, trend, alerts, plant_inventory.
                Allowed primaryToolId: telemetry.latest, space.trend, space.analyser, plant.alerts, plant.inventory.
                sensorType when telemetry/trend: PH, TEMPERATURE, PRESSURE, GAS_FLOW, METHANE, HYDROGEN_SULFIDE, LIQUID_LEVEL, FLOW_TRANSMITTER or null.
                No markdown. No extra keys.
                """;
        try {
            return llmClient.complete(system, "User question: " + query)
                    .map(json -> mergeParsed(query, rulesSlots, stickyPlantId, json))
                    .orElse(rulesSlots);
        } catch (Exception ex) {
            log.debug("NovaThink skipped: {}", ex.getMessage());
            return rulesSlots;
        }
    }

    private SwarmSearchSlots mergeParsed(String query, SwarmSearchSlots fallback, Long stickyPlantId, String json) {
        try {
            String cleaned = json.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replaceAll("^```json\\s*", "").replaceAll("^```\\s*", "").replaceAll("```$", "").trim();
            }
            JsonNode node = objectMapper.readTree(cleaned);
            String intent = text(node, "intent");
            String tool = text(node, "primaryToolId");
            if (intent == null || !ALLOWED_INTENTS.contains(intent)) {
                return fallback;
            }
            if (tool == null || !ALLOWED_TOOLS.contains(tool)) {
                return fallback;
            }
            SensorType sensor = parseSensor(text(node, "sensorType"));
            double confidence = node.path("confidence").asDouble(0.75);
            return SwarmSearchSlots.builder()
                    .intent(intent)
                    .primaryToolId(tool)
                    .sensorType(sensor)
                    .plantIdHint(stickyPlantId)
                    .confidence(Math.min(1.0, Math.max(0.5, confidence)))
                    .periodLabel(fallback.periodLabel() != null ? fallback.periodLabel() : "latest")
                    .build();
        } catch (Exception ex) {
            log.debug("NovaThink parse failed, using rules: {}", ex.getMessage());
            return fallback;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) {
            return null;
        }
        String s = v.asText();
        return s == null || s.isBlank() ? null : s;
    }

    private static SensorType parseSensor(String raw) {
        if (raw == null) {
            return null;
        }
        try {
            return SensorType.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
