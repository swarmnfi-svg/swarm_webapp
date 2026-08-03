package com.biopower.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class SwarmUrlServiceTest {

    @Test
    void normalizeApiBase_appendsApiSuffix() {
        assertEquals("https://backend.example.com/api", SwarmUrlService.normalizeApiBase("https://backend.example.com"));
        assertEquals("https://backend.example.com/api", SwarmUrlService.normalizeApiBase("https://backend.example.com/"));
        assertEquals("https://backend.example.com/api", SwarmUrlService.normalizeApiBase("https://backend.example.com/api"));
        assertEquals("https://backend.example.com/api", SwarmUrlService.normalizeApiBase("https://backend.example.com/api/"));
    }
}
