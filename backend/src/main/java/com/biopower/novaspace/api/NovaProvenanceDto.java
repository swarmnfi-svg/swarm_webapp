package com.biopower.novaspace.api;

import lombok.Builder;

@Builder
public record NovaProvenanceDto(String metric, String sourceTool, Long plantId) {}
