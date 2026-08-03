package com.biopower.novaspace.skills.impl;

import com.biopower.dto.response.AlertResponse;
import com.biopower.model.enums.AlertStatus;
import com.biopower.novaspace.facts.*;
import com.biopower.novaspace.skills.NovaSkill;
import com.biopower.novaspace.skills.NovaSkillContext;
import com.biopower.novaspace.skills.NovaSkillResult;
import com.biopower.novaspace.skills.NovaToolIds;
import com.biopower.service.AlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class PlantAlertsSkill implements NovaSkill {

    private final AlertService alertService;

    @Override
    public String toolId() {
        return NovaToolIds.PLANT_ALERTS;
    }

    @Override
    public NovaSkillResult execute(NovaSkillContext ctx) {
        if (ctx.plantId() == null) {
            return NovaSkillResult.empty();
        }
        List<AlertResponse> alerts = alertService.getAlertsForUser(ctx.principal(), ctx.plantId(), AlertStatus.ACTIVE);
        List<RankedIssue> issues = new ArrayList<>();
        int rank = 1;
        for (AlertResponse alert : alerts) {
            issues.add(RankedIssue.builder()
                    .rank(rank++)
                    .title(alert.getTitle())
                    .detail(alert.getMessage())
                    .severity(alert.getSeverity() != null && alert.getSeverity().name().equals("CRITICAL") ? 90 : 60)
                    .evidence(List.of(new ProvenanceLink("Alerts", "/alerts?plantId=" + ctx.plantId(), toolId())))
                    .build());
        }
        return NovaSkillResult.success(FactPack.builder()
                .issues(issues)
                .metrics(List.of(MetricFact.builder()
                        .metric("ACTIVE_ALERTS")
                        .value((double) alerts.size())
                        .unit("count")
                        .quality(QualityFlag.GOOD)
                        .plantId(ctx.plantId())
                        .build()))
                .links(List.of(new ProvenanceLink("Alerts", "/alerts?plantId=" + ctx.plantId(), toolId())))
                .periodLabel("current")
                .build());
    }
}
