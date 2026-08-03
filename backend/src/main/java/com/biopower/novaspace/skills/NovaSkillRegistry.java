package com.biopower.novaspace.skills;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
public class NovaSkillRegistry {

    private final Map<String, NovaSkill> skills = new HashMap<>();

    public NovaSkillRegistry(List<NovaSkill> skillList) {
        for (NovaSkill skill : skillList) {
            skills.put(skill.toolId(), skill);
        }
    }

    public Optional<NovaSkill> get(String toolId) {
        return Optional.ofNullable(skills.get(toolId));
    }

    public boolean has(String toolId) {
        return skills.containsKey(toolId);
    }
}
