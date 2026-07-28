package com.biopower.controller;

import com.biopower.dto.request.HmiCommandRequest;
import com.biopower.dto.request.HmiMasterRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.HmiDiagramResponse;
import com.biopower.dto.response.HmiStateResponse;
import com.biopower.security.UserPrincipal;
import com.biopower.service.HmiService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/hmi")
@RequiredArgsConstructor
public class HmiController {

    private final HmiService hmiService;

    @GetMapping("/{plantId}/diagram")
    public ResponseEntity<ApiResponse<HmiDiagramResponse>> getDiagram(
            @PathVariable Long plantId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(hmiService.getDiagram(plantId, principal)));
    }

    @GetMapping("/{plantId}/state")
    public ResponseEntity<ApiResponse<HmiStateResponse>> getState(
            @PathVariable Long plantId,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(hmiService.getState(plantId, principal)));
    }

    @PostMapping("/{plantId}/commands")
    public ResponseEntity<ApiResponse<HmiStateResponse>> sendCommand(
            @PathVariable Long plantId,
            @Valid @RequestBody HmiCommandRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(
                "Command applied", hmiService.applyCommand(plantId, request, principal)));
    }

    @PostMapping("/{plantId}/master")
    public ResponseEntity<ApiResponse<HmiStateResponse>> sendMaster(
            @PathVariable Long plantId,
            @Valid @RequestBody HmiMasterRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(
                "Master command applied", hmiService.applyMaster(plantId, request, principal)));
    }
}
