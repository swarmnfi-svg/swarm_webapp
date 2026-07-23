package com.biopower.controller;

import com.biopower.dto.partner.*;
import com.biopower.security.PartnerPrincipal;
import com.biopower.service.PartnerTelemetryService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/partner/v1")
@RequiredArgsConstructor
public class PartnerTelemetryController {

    private final PartnerTelemetryService partnerTelemetryService;

    @GetMapping("/health")
    public ResponseEntity<PartnerHealthResponse> health(@AuthenticationPrincipal PartnerPrincipal principal) {
        return ResponseEntity.ok(partnerTelemetryService.health(principal));
    }

    @GetMapping("/plants")
    public ResponseEntity<List<PartnerPlantResponse>> plants(@AuthenticationPrincipal PartnerPrincipal principal) {
        return ResponseEntity.ok(partnerTelemetryService.listPlants(principal));
    }

    @GetMapping("/devices")
    public ResponseEntity<List<PartnerDeviceResponse>> devices(
            @AuthenticationPrincipal PartnerPrincipal principal,
            @RequestParam(required = false) Long plantId) {
        return ResponseEntity.ok(partnerTelemetryService.listDevices(principal, plantId));
    }

    @GetMapping("/telemetry/latest")
    public ResponseEntity<List<PartnerReadingResponse>> latest(
            @AuthenticationPrincipal PartnerPrincipal principal,
            @RequestParam(required = false) Long plantId,
            @RequestParam(required = false) String deviceId) {
        return ResponseEntity.ok(partnerTelemetryService.latest(principal, plantId, deviceId));
    }

    @GetMapping("/telemetry/history")
    public ResponseEntity<PartnerHistoryPageResponse> history(
            @AuthenticationPrincipal PartnerPrincipal principal,
            @RequestParam(required = false) Long plantId,
            @RequestParam(required = false) String deviceId,
            @RequestParam(required = false) String metricType,
            @RequestParam(required = false) String updatedSince,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return ResponseEntity.ok(partnerTelemetryService.history(
                principal, plantId, deviceId, metricType, updatedSince, cursor, limit));
    }

    @GetMapping("/telemetry/alerts")
    public ResponseEntity<List<PartnerAlertResponse>> alerts(
            @AuthenticationPrincipal PartnerPrincipal principal,
            @RequestParam(required = false) Long plantId,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(partnerTelemetryService.alerts(principal, plantId, status));
    }

    @GetMapping("/telemetry/health/{plantId}")
    public ResponseEntity<PartnerPlantHealthResponse> plantHealth(
            @AuthenticationPrincipal PartnerPrincipal principal,
            @PathVariable Long plantId) {
        return ResponseEntity.ok(partnerTelemetryService.plantHealth(principal, plantId));
    }

    @GetMapping("/aggregates/daily")
    public ResponseEntity<PartnerDailyAggregatePageResponse> dailyAggregates(
            @AuthenticationPrincipal PartnerPrincipal principal,
            @RequestParam(required = false) Long plantId,
            @RequestParam(required = false) String deviceId,
            @RequestParam(required = false) String metricType,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(partnerTelemetryService.dailyAggregates(
                principal, plantId, deviceId, metricType, from, to));
    }
}
