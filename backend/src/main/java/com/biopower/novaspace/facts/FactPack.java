package com.biopower.novaspace.facts;

import lombok.Builder;

import java.util.List;

@Builder
public record FactPack(
        List<MetricFact> metrics,
        List<RankedIssue> issues,
        List<ProvenanceLink> links,
        String periodLabel,
        String summaryNote
) {
    public static FactPack empty(String note) {
        return new FactPack(List.of(), List.of(), List.of(), null, note);
    }
}
