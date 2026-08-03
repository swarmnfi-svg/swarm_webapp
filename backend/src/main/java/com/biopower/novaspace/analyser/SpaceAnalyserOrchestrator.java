package com.biopower.novaspace.analyser;

import com.biopower.novaspace.facts.*;
import com.biopower.novaspace.permissions.NovaToolPermissionService;
import com.biopower.novaspace.plan.NovaPlanStep;
import com.biopower.novaspace.skills.*;
import com.biopower.novaspace.skills.impl.PlantAiRecommendationsSkill;
import com.biopower.novaspace.skills.impl.PlantAlertsSkill;
import com.biopower.novaspace.skills.impl.PlantDashboardSkill;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * NovANALYSER-style fan-out: plan steps → concurrent skills → correlate → rank.
 */
@Component
@RequiredArgsConstructor
public class SpaceAnalyserOrchestrator {

    private final PlantDashboardSkill plantDashboardSkill;
    private final PlantAlertsSkill plantAlertsSkill;
    private final PlantAiRecommendationsSkill plantAiRecommendationsSkill;
    private final NovaToolPermissionService permissions;

    private Map<String, NovaSkill> fanOutSkills() {
        return Map.of(
                NovaToolIds.PLANT_DASHBOARD, plantDashboardSkill,
                NovaToolIds.PLANT_ALERTS, plantAlertsSkill,
                NovaToolIds.PLANT_AI_RECOMMENDATIONS, plantAiRecommendationsSkill
        );
    }

    public List<NovaPlanStep> buildPlanSteps() {
        return List.of(
                NovaPlanStep.builder().toolId(NovaToolIds.PLANT_DASHBOARD).moduleId("dashboard").build(),
                NovaPlanStep.builder().toolId(NovaToolIds.PLANT_ALERTS).moduleId("alerts").build(),
                NovaPlanStep.builder().toolId(NovaToolIds.PLANT_AI_RECOMMENDATIONS).moduleId("ai").build()
        );
    }

    public FactPack run(NovaSkillContext baseCtx) {
        List<MetricFact> allMetrics = new ArrayList<>();
        List<RankedIssue> allIssues = new ArrayList<>();
        List<ProvenanceLink> allLinks = new ArrayList<>();

        for (NovaPlanStep step : buildPlanSteps()) {
            if (!permissions.canRunTool(baseCtx.principal(), step.toolId())) {
                continue;
            }
            NovaSkill skill = fanOutSkills().get(step.toolId());
            if (skill == null) {
                continue;
            }
            NovaSkillResult result = skill.execute(baseCtx);
            if (!result.ok() || result.factPack() == null) {
                continue;
            }
            FactPack pack = result.factPack();
            if (pack.metrics() != null) {
                allMetrics.addAll(pack.metrics());
            }
            if (pack.issues() != null) {
                allIssues.addAll(pack.issues());
            }
            if (pack.links() != null) {
                allLinks.addAll(pack.links());
            }
        }

        List<RankedIssue> ranked = rankIssues(allIssues, allMetrics);
        return FactPack.builder()
                .metrics(allMetrics)
                .issues(ranked)
                .links(allLinks)
                .periodLabel(baseCtx.periodLabel())
                .summaryNote(ranked.isEmpty() ? "No critical issues detected from available modules." : null)
                .build();
    }

    private List<RankedIssue> rankIssues(List<RankedIssue> issues, List<MetricFact> metrics) {
        List<RankedIssue> combined = new ArrayList<>(issues);
        metrics.stream()
                .filter(m -> "HEALTH_SCORE".equals(m.metric()) && m.value() != null && m.value() < 75)
                .findFirst()
                .ifPresent(m -> combined.add(RankedIssue.builder()
                        .rank(0)
                        .title("Low plant health score")
                        .detail("Health score is " + m.value().intValue() + "/100")
                        .severity(100 - m.value())
                        .evidence(List.of(new ProvenanceLink("Dashboard", "/dashboard?plantId=" + m.plantId(), NovaToolIds.PLANT_DASHBOARD)))
                        .build()));

        combined.sort(Comparator.comparingDouble(RankedIssue::severity).reversed());
        int rank = 1;
        List<RankedIssue> out = new ArrayList<>();
        for (RankedIssue issue : combined.stream().limit(5).toList()) {
            out.add(RankedIssue.builder()
                    .rank(rank++)
                    .title(issue.title())
                    .detail(issue.detail())
                    .severity(issue.severity())
                    .evidence(issue.evidence())
                    .build());
        }
        return out;
    }
}
