package com.biopower.novaspace.api;

import lombok.Builder;

import java.util.List;

@Builder
public record NovaClarifyOption(String id, String label, String kind) {}
