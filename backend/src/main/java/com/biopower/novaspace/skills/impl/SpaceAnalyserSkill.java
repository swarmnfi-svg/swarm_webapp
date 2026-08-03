package com.biopower.novaspace.skills.impl;

import com.biopower.novaspace.analyser.SpaceAnalyserOrchestrator;
import com.biopower.novaspace.facts.FactPack;
import com.biopower.novaspace.skills.NovaSkill;
import com.biopower.novaspace.skills.NovaSkillContext;
import com.biopower.novaspace.skills.NovaSkillResult;
import com.biopower.novaspace.skills.NovaToolIds;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SpaceAnalyserSkill implements NovaSkill {

    private final SpaceAnalyserOrchestrator orchestrator;

    @Override
    public String toolId() {
        return NovaToolIds.SPACE_ANALYSER;
    }

    @Override
    public NovaSkillResult execute(NovaSkillContext ctx) {
        if (ctx.plantId() == null) {
            return NovaSkillResult.empty();
        }
        FactPack pack = orchestrator.run(ctx);
        return NovaSkillResult.success(pack);
    }
}
