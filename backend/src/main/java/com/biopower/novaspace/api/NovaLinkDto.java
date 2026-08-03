package com.biopower.novaspace.api;

import lombok.Builder;

@Builder
public record NovaLinkDto(String label, String path) {}
