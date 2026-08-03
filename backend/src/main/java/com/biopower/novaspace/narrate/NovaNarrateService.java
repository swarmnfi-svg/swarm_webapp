package com.biopower.novaspace.narrate;

import com.biopower.novaspace.config.NovaSpaceOpProperties;
import com.biopower.novaspace.facts.FactPack;
import com.biopower.novaspace.facts.MetricFact;
import com.biopower.novaspace.facts.RankedIssue;
import com.biopower.novaspace.llm.NovaLlmClient;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Facts-first narration (NOVA DNA): deterministic base, optional LLM polish when configured.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class NovaNarrateService {

    private final NovaSpaceOpProperties properties;
    private final NovaLlmClient llmClient;
    private final ObjectMapper objectMapper;

    public String format(FactPack facts, String userQuery) {
        String base = formatDeterministic(facts, userQuery);
        if (!properties.getNarrate().isEnabled() || !llmClient.isConfigured()) {
            return base;
        }
        try {
            String system = """
                    You are Nova Space OP for SWARM biogas plants. Rewrite the draft answer clearly for an operator.
                    Rules: keep every number, unit, plant name, and timestamp from the draft; do not invent sensors or values;
                    read-only insights only; concise; no SQL; no setpoints.
                    """;
            String user = "Question: " + userQuery + "\n\nDraft answer:\n" + base
                    + "\n\nFact pack JSON:\n" + objectMapper.writeValueAsString(facts);
            return llmClient.complete(system, user).orElse(base);
        } catch (Exception ex) {
            log.debug("Nova narrate LLM polish skipped: {}", ex.getMessage());
            return base;
        }
    }

    private String formatDeterministic(FactPack facts, String userQuery) {
        if (facts == null) {
            return "I could not retrieve plant data for that question.";
        }

        if (facts.summaryNote() != null && facts.metrics() != null
                && facts.metrics().stream().anyMatch(m -> "PLANT_COUNT".equals(m.metric()))) {
            return facts.summaryNote();
        }

        StringBuilder sb = new StringBuilder();

        if (facts.metrics() != null && facts.metrics().size() == 1) {
            MetricFact m = facts.metrics().get(0);
            if (m.quality() == com.biopower.novaspace.facts.QualityFlag.MISSING) {
                sb.append("No recent ").append(m.metric()).append(" reading is available");
                if (m.plantName() != null) {
                    sb.append(" for ").append(m.plantName());
                }
                sb.append(".");
                return sb.toString();
            }
            if (m.value() != null) {
                sb.append("Latest ").append(formatMetricName(m.metric()));
                if (m.plantName() != null) {
                    sb.append(" at ").append(m.plantName());
                }
                sb.append(": **").append(formatValue(m)).append("**");
                if (m.nodeName() != null) {
                    sb.append(" (sensor: ").append(m.nodeName()).append(")");
                }
                if (m.recordedAt() != null) {
                    sb.append(", recorded at ").append(m.recordedAt());
                }
                sb.append(".");
                return sb.toString();
            }
        }

        if (facts.issues() != null && !facts.issues().isEmpty()) {
            sb.append("Here is what needs attention");
            if (facts.periodLabel() != null) {
                sb.append(" (").append(facts.periodLabel()).append(")");
            }
            sb.append(":\n\n");
            for (RankedIssue issue : facts.issues()) {
                sb.append(issue.rank()).append(". **").append(issue.title()).append("** — ")
                        .append(issue.detail()).append("\n");
            }
        } else if (facts.metrics() != null && !facts.metrics().isEmpty()) {
            sb.append("Plant telemetry summary:\n");
            for (MetricFact m : facts.metrics().stream().limit(8).toList()) {
                if (m.value() != null) {
                    sb.append("- ").append(formatMetricName(m.metric())).append(": ")
                            .append(formatValue(m)).append("\n");
                }
            }
        } else if (facts.summaryNote() != null) {
            sb.append(facts.summaryNote());
        } else {
            sb.append("I processed your question but found no matching telemetry insights.");
        }

        return sb.toString().trim();
    }

    private String formatMetricName(String metric) {
        return metric.replace('_', ' ').toLowerCase();
    }

    private String formatValue(MetricFact m) {
        String unit = m.unit() != null ? " " + m.unit() : "";
        return m.value() + unit;
    }
}
