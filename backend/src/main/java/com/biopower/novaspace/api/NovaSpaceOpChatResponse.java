package com.biopower.novaspace.api;

import lombok.Builder;

import java.util.List;

@Builder
public record NovaSpaceOpChatResponse(
        boolean ok,
        String answer,
        Long threadId,
        List<String> toolsUsed,
        List<NovaClarifyOption> clarifyOptions,
        String clarifyKind,
        List<NovaProvenanceDto> provenance,
        List<NovaLinkDto> links
) {}
