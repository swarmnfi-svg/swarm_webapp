package com.biopower.controller;

import com.biopower.dto.request.DevicePairRequest;
import com.biopower.dto.request.SyncReadingsRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.DevicePairResponse;
import com.biopower.security.UserPrincipal;
import com.biopower.service.DeviceService;
import com.biopower.service.EspProxyService;
import com.biopower.service.SwarmUrlService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final DeviceService deviceService;
    private final EspProxyService espProxyService;
    private final SwarmUrlService swarmUrlService;

    @GetMapping("/swarm-url")
    public ResponseEntity<ApiResponse<String>> getSwarmUrl() {
        return ResponseEntity.ok(ApiResponse.success(swarmUrlService.resolveSwarmBaseUrl()));
    }

    @PostMapping("/pair")
    public ResponseEntity<ApiResponse<DevicePairResponse>> pairDevice(
            @Valid @RequestBody DevicePairRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        DevicePairResponse response = deviceService.pairDevice(request, principal);
        String message = response.isNewlyPaired() ? "Device paired successfully" : "Device already paired";
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(message, response));
    }

    @PostMapping("/sync-readings")
    public ResponseEntity<ApiResponse<Void>> syncReadings(
            @Valid @RequestBody SyncReadingsRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        deviceService.syncReadings(request, principal);
        return ResponseEntity.ok(ApiResponse.success("Sensor readings synced", null));
    }

    @GetMapping(value = "/esp/info", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> espInfo(@RequestParam String ip) {
        return ResponseEntity.ok(espProxyService.fetchInfo(ip));
    }

    @GetMapping(value = "/esp/status", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> espStatus(@RequestParam String ip, @RequestParam String password) {
        return ResponseEntity.ok(espProxyService.fetchStatus(ip, password));
    }

    @PostMapping(value = "/esp/configure", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> espConfigure(
            @RequestParam String ip,
            @RequestParam String password,
            @RequestBody Map<String, Object> config) {
        return ResponseEntity.ok(espProxyService.configure(ip, password, config));
    }
}
