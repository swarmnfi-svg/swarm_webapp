package com.biopower.controller;

import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.DashboardResponse;
import com.biopower.model.enums.AlertStatus;
import com.biopower.model.enums.SensorType;
import com.biopower.dto.response.AlertResponse;
import com.biopower.dto.response.AiRecommendationResponse;
import com.biopower.dto.response.SensorReadingResponse;
import com.biopower.security.UserPrincipal;
import com.biopower.service.AiHealthService;
import com.biopower.service.AlertService;
import com.biopower.service.AnalyticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class DashboardController {

    private final AiHealthService aiHealthService;
    private final AlertService alertService;
    private final AnalyticsService analyticsService;

    @GetMapping("/dashboard/{plantId}")
    public ResponseEntity<ApiResponse<DashboardResponse>> getDashboard(
            @PathVariable Long plantId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(aiHealthService.getDashboard(plantId, principal)));
    }

    @GetMapping("/analytics/{plantId}")
    public ResponseEntity<ApiResponse<List<SensorReadingResponse>>> getAnalytics(
            @PathVariable Long plantId,
            @RequestParam(required = false) SensorType sensorType,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime end) {
        List<SensorReadingResponse> data = sensorType != null
                ? analyticsService.getHistoricalData(plantId, sensorType, start, end)
                : analyticsService.getAllSensorData(plantId, start, end);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @GetMapping("/alerts")
    public ResponseEntity<ApiResponse<List<AlertResponse>>> getAlerts(
            @RequestParam(required = false) Long plantId,
            @RequestParam(required = false) AlertStatus status) {
        List<AlertResponse> alerts;
        if (plantId != null && status != null) {
            alerts = alertService.getAlertsByPlantAndStatus(plantId, status);
        } else if (plantId != null) {
            alerts = alertService.getAlertsByPlant(plantId);
        } else if (status != null) {
            alerts = alertService.getAlertsByStatus(status);
        } else {
            alerts = alertService.getAllAlerts();
        }
        return ResponseEntity.ok(ApiResponse.success(alerts));
    }

    @PatchMapping("/alerts/{id}/acknowledge")
    public ResponseEntity<ApiResponse<AlertResponse>> acknowledgeAlert(
            @PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(
                "Alert acknowledged", alertService.acknowledgeAlert(id, principal.getId())));
    }

    @PatchMapping("/alerts/{id}/resolve")
    public ResponseEntity<ApiResponse<AlertResponse>> resolveAlert(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success("Alert resolved", alertService.resolveAlert(id)));
    }

    @GetMapping("/ai/recommendations/{plantId}")
    public ResponseEntity<ApiResponse<List<AiRecommendationResponse>>> getRecommendations(
            @PathVariable Long plantId) {
        return ResponseEntity.ok(ApiResponse.success(aiHealthService.getRecommendations(plantId)));
    }

    @PatchMapping("/ai/recommendations/{id}/acknowledge")
    public ResponseEntity<ApiResponse<Void>> acknowledgeRecommendation(@PathVariable Long id) {
        aiHealthService.acknowledgeRecommendation(id);
        return ResponseEntity.ok(ApiResponse.success("Recommendation acknowledged", null));
    }
}
