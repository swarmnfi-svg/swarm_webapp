package com.biopower.novaspace.skills;

public interface NovaSkill {
    String toolId();

    NovaSkillResult execute(NovaSkillContext ctx);
}
