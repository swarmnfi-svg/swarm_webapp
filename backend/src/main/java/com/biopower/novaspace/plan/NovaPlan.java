package com.biopower.novaspace.plan;

import lombok.Builder;

import java.util.List;

@Builder
public record NovaPlan(List<NovaPlanStep> steps, boolean needsPlantClarify) {}
