package com.biopower.novaspace.plan;

import lombok.Builder;

@Builder
public record NovaPlanStep(String toolId, String moduleId) {}
