package com.biopower.controller;

import com.biopower.dto.request.PlantRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.PlantResponse;
import com.biopower.model.entity.Plant;
import com.biopower.repository.UserRepository;
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
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<ApiResponse<List<PlantResponse>>> getPlants(
            @AuthenticationPrincipal UserPrincipal principal) {
        boolean isSuperAdmin = principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_SUPER_ADMIN"));
        if (isSuperAdmin) {
            return ResponseEntity.ok(ApiResponse.success(plantService.getAllPlants()));
        }
        List<Long> plantIds = userRepository.findById(principal.getId())
                .map(user -> user.getAssignedPlants().stream().map(Plant::getPlantId).toList())
                .orElse(principal.getPlantIds());
        return ResponseEntity.ok(ApiResponse.success(plantService.getPlantsForUser(plantIds, false)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<PlantResponse>> getPlant(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(plantService.getPlantById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<PlantResponse>> createPlant(
            @Valid @RequestBody PlantRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Plant created", plantService.createPlant(request, principal)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<PlantResponse>> updatePlant(
            @PathVariable Long id,
            @Valid @RequestBody PlantRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success("Plant updated", plantService.updatePlant(id, request, principal)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deletePlant(@PathVariable Long id) {
        plantService.deletePlant(id);
        return ResponseEntity.ok(ApiResponse.success("Plant deleted", null));
    }
}
