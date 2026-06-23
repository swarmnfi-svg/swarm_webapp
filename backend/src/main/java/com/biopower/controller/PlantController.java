package com.biopower.controller;

import com.biopower.dto.request.PlantRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.PlantResponse;
import com.biopower.security.UserPrincipal;
import com.biopower.service.PlantService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/plants")
@RequiredArgsConstructor
public class PlantController {

    private final PlantService plantService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<PlantResponse>>> getPlants(
            @AuthenticationPrincipal UserPrincipal principal) {
        boolean isSuperAdmin = principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_SUPER_ADMIN"));
        return ResponseEntity.ok(ApiResponse.success(
                plantService.getPlantsForUser(principal.getPlantIds(), isSuperAdmin)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<PlantResponse>> getPlant(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(plantService.getPlantById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<PlantResponse>> createPlant(@Valid @RequestBody PlantRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Plant created", plantService.createPlant(request)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<PlantResponse>> updatePlant(
            @PathVariable Long id, @Valid @RequestBody PlantRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Plant updated", plantService.updatePlant(id, request)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deletePlant(@PathVariable Long id) {
        plantService.deletePlant(id);
        return ResponseEntity.ok(ApiResponse.success("Plant deleted", null));
    }
}
