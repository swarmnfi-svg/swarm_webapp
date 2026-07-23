package com.biopower.service;

import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.UserRepository;
import com.biopower.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PlantAccessService {

    private final UserRepository userRepository;
    private final PlantRepository plantRepository;

    public boolean isSuperAdmin(UserPrincipal principal) {
        return principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_SUPER_ADMIN"));
    }

    public boolean isPlantAdmin(UserPrincipal principal) {
        return principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_PLANT_ADMIN"));
    }

    public boolean isOperator(UserPrincipal principal) {
        return principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_OPERATOR"));
    }

    public boolean canManageUsers(UserPrincipal principal) {
        return isSuperAdmin(principal) || isPlantAdmin(principal);
    }

    public void assertCanAccessPlant(UserPrincipal principal, Long plantId) {
        if (isSuperAdmin(principal)) {
            return;
        }
        if (plantId == null || !principal.getPlantIds().contains(plantId)) {
            throw new AccessDeniedException("You do not have access to this plant");
        }
    }

    public boolean shouldFilterSensorsForOperator(UserPrincipal principal) {
        List<Long> nodeIds = resolveAssignedNodeIds(principal);
        return isOperator(principal) && nodeIds != null && !nodeIds.isEmpty();
    }

    @Transactional(readOnly = true)
    public List<Long> resolveAccessiblePlantIds(UserPrincipal principal) {
        if (isSuperAdmin(principal)) {
            return plantRepository.findAll().stream()
                    .map(Plant::getPlantId)
                    .collect(Collectors.toList());
        }
        return userRepository.findById(principal.getId())
                .map(user -> user.getAssignedPlants().stream()
                        .map(Plant::getPlantId)
                        .collect(Collectors.toList()))
                .orElse(principal.getPlantIds() != null ? principal.getPlantIds() : List.of());
    }

    @Transactional(readOnly = true)
    public List<Long> resolveAssignedNodeIds(UserPrincipal principal) {
        if (!isOperator(principal)) {
            return null;
        }
        return userRepository.findById(principal.getId())
                .map(user -> user.getAssignedSensorNodes().stream()
                        .map(SensorNode::getNodeId)
                        .collect(Collectors.toList()))
                .orElse(principal.getNodeIds() != null ? principal.getNodeIds() : List.of());
    }
}
