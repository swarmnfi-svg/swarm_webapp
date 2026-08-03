package com.biopower.novaspace.skills;

import com.biopower.model.enums.SensorType;
import com.biopower.security.UserPrincipal;
import lombok.Builder;

import java.time.LocalDateTime;

@Builder
public record NovaSkillContext(
        UserPrincipal principal,
        String query,
        Long plantId,
        String plantName,
        SensorType sensorType,
        LocalDateTime rangeStart,
        LocalDateTime rangeEnd,
        String periodLabel
) {
}
