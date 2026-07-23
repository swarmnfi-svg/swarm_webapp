package com.biopower.controller;

import com.biopower.dto.response.ApiResponse;
import com.biopower.model.enums.AlertStatus;
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

    private final AlertService alertService;

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getNotifications(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "counts", Map.of(
                        "active", alertService.countAlertsForUser(principal, AlertStatus.ACTIVE),
                        "acknowledged", alertService.countAlertsForUser(principal, AlertStatus.ACKNOWLEDGED),
                        "resolved", alertService.countAlertsForUser(principal, AlertStatus.RESOLVED)),
                "activeAlerts", alertService.getAlertsForUser(principal, null, AlertStatus.ACTIVE),
                "acknowledgedAlerts", alertService.getAlertsForUser(principal, null, AlertStatus.ACKNOWLEDGED),
                "resolvedAlerts", alertService.getAlertsForUser(principal, null, AlertStatus.RESOLVED)
        )));
    }
}
