package com.biopower.novaspace.plan;

import com.biopower.novaspace.permissions.NovaToolPermissionService;
import com.biopower.novaspace.search.SwarmSearchSlots;
import com.biopower.security.UserPrincipal;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class NovaPlanBuilder {

    public NovaPlan build(SwarmSearchSlots slots, UserPrincipal principal, NovaToolPermissionService permissions) {
        List<NovaPlanStep> steps = new ArrayList<>();
        if (slots.primaryToolId() != null && permissions.canRunTool(principal, slots.primaryToolId())) {
            steps.add(NovaPlanStep.builder()
                    .toolId(slots.primaryToolId())
                    .moduleId(slots.intent())
                    .build());
        }
        boolean needsPlant = slots.plantIdHint() == null;
        return NovaPlan.builder().steps(steps).needsPlantClarify(needsPlant).build();
    }
}
