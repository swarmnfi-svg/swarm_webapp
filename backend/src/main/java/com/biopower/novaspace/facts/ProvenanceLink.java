package com.biopower.novaspace.facts;

import lombok.Builder;

@Builder
public record ProvenanceLink(
        String label,
        String path,
        String sourceTool
) {
}
