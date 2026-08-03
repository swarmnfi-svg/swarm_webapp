package com.biopower.novaspace.llm;

import lombok.Builder;

@Builder
public record NovaLlmSlot(
        String name,
        NovaLlmProviderType type,
        String baseUrl,
        String apiKey,
        String model
) {}
