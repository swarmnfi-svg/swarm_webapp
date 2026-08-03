package com.biopower.controller;

import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.PredictiveMaintenanceResponse;
import com.biopower.security.UserPrincipal;
import com.biopower.service.PredictiveMaintenanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/maintenance")
@RequiredArgsConstructor
public class MaintenanceController {

    private final PredictiveMaintenanceService maintenanceService;

    @GetMapping("/{plantId}")
    public ResponseEntity<ApiResponse<List<PredictiveMaintenanceResponse>>> getMaintenance(
            @PathVariable Long plantId,
            @AuthenticationPrincipal UserPrincipal principal) {
        maintenanceService.generatePredictionsForPlant(plantId);
        return ResponseEntity.ok(ApiResponse.success(maintenanceService.getByPlant(plantId, principal)));
    }
}
