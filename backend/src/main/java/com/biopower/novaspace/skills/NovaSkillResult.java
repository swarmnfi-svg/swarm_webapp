package com.biopower.novaspace.skills;

import com.biopower.novaspace.facts.FactPack;
import lombok.Builder;

@Builder
public record NovaSkillResult(
        boolean ok,
        boolean denied,
        String denialReason,
        FactPack factPack
) {
    public static NovaSkillResult denied(String reason) {
        return NovaSkillResult.builder().ok(false).denied(true).denialReason(reason).build();
    }

    public static NovaSkillResult success(FactPack pack) {
        return NovaSkillResult.builder().ok(true).denied(false).factPack(pack).build();
    }

    public static NovaSkillResult empty() {
        return NovaSkillResult.builder().ok(false).denied(false).build();
    }
}
