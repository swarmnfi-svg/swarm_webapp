package com.biopower.novaspace.facts;

import lombok.Builder;

import java.time.Instant;

@Builder
public record MetricFact(
        String metric,
        Double value,
        String unit,
        QualityFlag quality,
        Long plantId,
        String plantName,
        Long nodeId,
        String nodeName,
        Instant recordedAt,
        String note
) {
}
