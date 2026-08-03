package com.biopower.novaspace.facts;

import lombok.Builder;

import java.util.List;

@Builder
public record RankedIssue(
        int rank,
        String title,
        String detail,
        double severity,
        List<ProvenanceLink> evidence
) {
}
