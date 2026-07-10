package com.biopower.controller;

import com.biopower.dto.request.SensorNodeRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.SensorNodeResponse;
import com.biopower.security.UserPrincipal;
import com.biopower.service.SensorNodeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/sensor-nodes")
@RequiredArgsConstructor
public class SensorNodeController {

    private final SensorNodeService sensorNodeService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<SensorNodeResponse>>> getAllNodes(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(sensorNodeService.getAllNodes(principal)));
    }

    @GetMapping("/plant/{plantId}")
    public ResponseEntity<ApiResponse<List<SensorNodeResponse>>> getNodesByPlant(
            @PathVariable Long plantId, @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(sensorNodeService.getNodesByPlant(plantId, principal)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<SensorNodeResponse>> getNode(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(sensorNodeService.getNodeById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<SensorNodeResponse>> createNode(
            @Valid @RequestBody SensorNodeRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Sensor node registered", sensorNodeService.createNode(request, principal)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<SensorNodeResponse>> updateNode(
            @PathVariable Long id,
            @Valid @RequestBody SensorNodeRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success("Sensor node updated",
                sensorNodeService.updateNode(id, request, principal)));
    }

    @PatchMapping("/{id}/toggle")
    public ResponseEntity<ApiResponse<SensorNodeResponse>> toggleNode(
            @PathVariable Long id,
            @RequestBody Map<String, Boolean> body,
            @AuthenticationPrincipal UserPrincipal principal) {
        boolean enable = body.getOrDefault("enable", true);
        return ResponseEntity.ok(ApiResponse.success(
                enable ? "Node enabled" : "Node disabled",
                sensorNodeService.toggleNode(id, enable, principal)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteNode(@PathVariable Long id) {
        sensorNodeService.deleteNode(id);
        return ResponseEntity.ok(ApiResponse.success("Sensor node deleted", null));
    }
}
