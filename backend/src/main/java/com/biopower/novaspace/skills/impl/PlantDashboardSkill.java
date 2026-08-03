package com.biopower.novaspace.skills.impl;

import com.biopower.dto.response.DashboardResponse;
import com.biopower.novaspace.facts.*;
import com.biopower.novaspace.skills.NovaSkill;
import com.biopower.novaspace.skills.NovaSkillContext;
import com.biopower.novaspace.skills.NovaSkillResult;
import com.biopower.novaspace.skills.NovaToolIds;
import com.biopower.service.AiHealthService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import com.biopower.model.enums.SensorType;

@Component
@RequiredArgsConstructor
public class PlantDashboardSkill implements NovaSkill {

    private final AiHealthService aiHealthService;

    @Override
    public String toolId() {
        return NovaToolIds.PLANT_DASHBOARD;
    }

    @Override
    public NovaSkillResult execute(NovaSkillContext ctx) {
        if (ctx.plantId() == null) {
            return NovaSkillResult.empty();
        }
        DashboardResponse dash = aiHealthService.getDashboard(ctx.plantId(), ctx.principal());
        List<MetricFact> metrics = new ArrayList<>();
        if (dash.getCurrentReadings() != null) {
            for (Map.Entry<SensorType, Double> e : dash.getCurrentReadings().entrySet()) {
                metrics.add(MetricFact.builder()
                        .metric(e.getKey().name())
                        .value(e.getValue())
                        .quality(QualityFlag.GOOD)
                        .plantId(ctx.plantId())
                        .plantName(dash.getPlantName())
                        .build());
            }
        }
        metrics.add(MetricFact.builder()
                .metric("HEALTH_SCORE")
                .value((double) dash.getHealthScore())
                .unit("score")
                .quality(QualityFlag.GOOD)
                .plantId(ctx.plantId())
                .plantName(dash.getPlantName())
                .build());
        metrics.add(MetricFact.builder()
                .metric("ACTIVE_ALERTS")
                .value((double) dash.getActiveAlerts())
                .unit("count")
                .quality(QualityFlag.GOOD)
                .plantId(ctx.plantId())
                .plantName(dash.getPlantName())
                .build());

        return NovaSkillResult.success(FactPack.builder()
                .metrics(metrics)
                .links(List.of(new ProvenanceLink("Dashboard", "/dashboard?plantId=" + ctx.plantId(), toolId())))
                .periodLabel(ctx.periodLabel())
                .build());
    }
}
