package com.biopower.novaspace.skills.impl;

import com.biopower.dto.response.SensorReadingResponse;
import com.biopower.novaspace.facts.*;
import com.biopower.novaspace.skills.NovaSkill;
import com.biopower.novaspace.skills.NovaSkillContext;
import com.biopower.novaspace.skills.NovaSkillResult;
import com.biopower.novaspace.skills.NovaToolIds;
import com.biopower.service.AnalyticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class SpaceTrendSkill implements NovaSkill {

    private final AnalyticsService analyticsService;

    @Override
    public String toolId() {
        return NovaToolIds.SPACE_TREND;
    }

    @Override
    public NovaSkillResult execute(NovaSkillContext ctx) {
        if (ctx.plantId() == null || ctx.sensorType() == null) {
            return NovaSkillResult.empty();
        }
        LocalDateTime end = ctx.rangeEnd() != null ? ctx.rangeEnd() : LocalDateTime.now();
        LocalDateTime start = ctx.rangeStart() != null ? ctx.rangeStart() : end.minusDays(7);
        List<SensorReadingResponse> readings = analyticsService.getHistoricalData(
                ctx.plantId(), ctx.sensorType(), start, end, ctx.principal());

        List<MetricFact> metrics = new ArrayList<>();
        for (SensorReadingResponse r : readings.stream().limit(24).toList()) {
            metrics.add(MetricFact.builder()
                    .metric(ctx.sensorType().name())
                    .value(r.getValue())
                    .unit(TelemetryLatestSkill.unitFor(ctx.sensorType()))
                    .quality(QualityFlag.GOOD)
                    .plantId(ctx.plantId())
                    .nodeId(r.getNodeId())
                    .recordedAt(r.getRecordedAt() != null ? r.getRecordedAt().atZone(java.time.ZoneOffset.UTC).toInstant() : null)
                    .build());
        }
        if (metrics.isEmpty()) {
            return NovaSkillResult.success(FactPack.builder()
                    .metrics(List.of())
                    .summaryNote("No historical readings in the selected window.")
                    .periodLabel(ctx.periodLabel())
                    .links(List.of(new ProvenanceLink("Analytics", "/analytics?plantId=" + ctx.plantId(), toolId())))
                    .build());
        }
        return NovaSkillResult.success(FactPack.builder()
                .metrics(metrics)
                .periodLabel(start.toLocalDate() + " to " + end.toLocalDate())
                .links(List.of(new ProvenanceLink("Analytics", "/analytics?plantId=" + ctx.plantId(), toolId())))
                .build());
    }
}
