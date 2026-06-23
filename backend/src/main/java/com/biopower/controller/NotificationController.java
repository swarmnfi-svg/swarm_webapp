package com.biopower.controller;

import com.biopower.dto.response.ApiResponse;
import com.biopower.model.enums.AlertStatus;
import com.biopower.repository.AlertRepository;
import com.biopower.security.UserPrincipal;
import com.biopower.service.AlertService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final AlertRepository alertRepository;
    private final AlertService alertService;

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getNotifications(
            @AuthenticationPrincipal UserPrincipal principal) {
        long active = alertRepository.countByStatus(AlertStatus.ACTIVE);
        long acknowledged = alertRepository.countByStatus(AlertStatus.ACKNOWLEDGED);
        long resolved = alertRepository.countByStatus(AlertStatus.RESOLVED);

        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "counts", Map.of("active", active, "acknowledged", acknowledged, "resolved", resolved),
                "activeAlerts", alertService.getAlertsByStatus(AlertStatus.ACTIVE),
                "acknowledgedAlerts", alertService.getAlertsByStatus(AlertStatus.ACKNOWLEDGED),
                "resolvedAlerts", alertService.getAlertsByStatus(AlertStatus.RESOLVED)
        )));
    }
}
