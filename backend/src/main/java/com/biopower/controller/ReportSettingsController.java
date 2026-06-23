package com.biopower.controller;

import com.biopower.dto.request.ReportRequest;
import com.biopower.dto.request.SettingsRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.model.entity.Report;
import com.biopower.model.entity.SystemSettings;
import com.biopower.security.UserPrincipal;
import com.biopower.service.ReportService;
import com.biopower.service.SettingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class ReportSettingsController {

    private final ReportService reportService;
    private final SettingsService settingsService;

    @GetMapping("/reports")
    public ResponseEntity<ApiResponse<List<Report>>> getReports(
            @RequestParam(required = false) Long plantId) {
        return ResponseEntity.ok(ApiResponse.success(reportService.getReports(plantId)));
    }

    @PostMapping("/reports/generate")
    public ResponseEntity<ApiResponse<Report>> generateReport(
            @Valid @RequestBody ReportRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Report generated", reportService.generateReport(request, principal.getId())));
    }

    @GetMapping("/settings")
    public ResponseEntity<ApiResponse<List<SystemSettings>>> getSettings() {
        return ResponseEntity.ok(ApiResponse.success(settingsService.getAllSettings()));
    }

    @GetMapping("/settings/map")
    public ResponseEntity<ApiResponse<Map<String, String>>> getSettingsMap() {
        return ResponseEntity.ok(ApiResponse.success(settingsService.getSettingsMap()));
    }

    @GetMapping("/settings/category/{category}")
    public ResponseEntity<ApiResponse<List<SystemSettings>>> getSettingsByCategory(@PathVariable String category) {
        return ResponseEntity.ok(ApiResponse.success(settingsService.getByCategory(category)));
    }

    @PostMapping("/settings")
    public ResponseEntity<ApiResponse<SystemSettings>> saveSetting(@Valid @RequestBody SettingsRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Setting saved", settingsService.saveSetting(request)));
    }
}
