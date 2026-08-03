package com.biopower.novaspace.skills.impl;

import com.biopower.dto.response.AiRecommendationResponse;
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

@Component
@RequiredArgsConstructor
public class PlantAiRecommendationsSkill implements NovaSkill {

    private final AiHealthService aiHealthService;

    @Override
    public String toolId() {
        return NovaToolIds.PLANT_AI_RECOMMENDATIONS;
    }

    @Override
    public NovaSkillResult execute(NovaSkillContext ctx) {
        if (ctx.plantId() == null) {
            return NovaSkillResult.empty();
        }
        List<AiRecommendationResponse> recs = aiHealthService.getRecommendations(ctx.plantId(), ctx.principal());
        List<RankedIssue> issues = new ArrayList<>();
        int rank = 1;
        for (AiRecommendationResponse rec : recs.stream().limit(5).toList()) {
            double severity = rec.getHealthScore() != null ? 100 - rec.getHealthScore() : 50;
            issues.add(RankedIssue.builder()
                    .rank(rank++)
                    .title(rec.getIssueType() != null ? rec.getIssueType().name() : "Recommendation")
                    .detail(rec.getRecommendation())
                    .severity(severity)
                    .evidence(List.of(new ProvenanceLink("AI", "/ai?plantId=" + ctx.plantId(), toolId())))
                    .build());
        }
        return NovaSkillResult.success(FactPack.builder()
                .issues(issues)
                .links(List.of(new ProvenanceLink("AI Recommendations", "/ai?plantId=" + ctx.plantId(), toolId())))
                .periodLabel(ctx.periodLabel())
                .build());
    }
}
