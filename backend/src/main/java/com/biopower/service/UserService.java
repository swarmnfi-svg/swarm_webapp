package com.biopower.service;

import com.biopower.dto.request.UserRequest;
import com.biopower.dto.response.UserResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.entity.User;
import com.biopower.model.enums.UserRole;
import com.biopower.model.enums.UserStatus;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.repository.UserRepository;
import com.biopower.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final PlantRepository plantRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public List<UserResponse> getUsersForAdmin(UserPrincipal principal) {
        if (isSuperAdmin(principal)) {
            return userRepository.findAll().stream().map(this::toResponse).collect(Collectors.toList());
        }
        return userRepository.findAll().stream()
                .filter(this::isManageableByPlantAdmin)
                .filter(user -> canPlantAdminAccessUser(principal, user))
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public UserResponse getUserById(Long id, UserPrincipal principal) {
        User user = findUser(id);
        assertCanManage(principal, user);
        return toResponse(user);
    }

    @Transactional
    public UserResponse createUser(UserRequest request, UserPrincipal principal) {
        String email = request.getEmail().trim();
        if (userRepository.existsByEmail(email)) {
            throw new BadRequestException("Email already registered");
        }
        if (request.getPassword() == null || request.getPassword().isBlank()) {
            throw new BadRequestException("Password is required");
        }
        UserRole role = resolveRoleForCreate(request.getRole(), principal);

        User user = User.builder()
                .name(request.getName().trim())
                .email(email)
                .mobile(request.getMobile())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(role)
                .status(UserStatus.ACTIVE)
                .assignedPlants(new HashSet<>(resolvePlants(request.getPlantIds(), principal)))
                .assignedSensorNodes(new HashSet<>(resolveSensorNodes(request.getNodeIds(), request.getPlantIds(), principal)))
                .build();
        return toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateUser(Long id, UserRequest request, UserPrincipal principal) {
        User user = findUser(id);
        assertCanManage(principal, user);

        String email = request.getEmail().trim();
        if (!user.getEmail().equalsIgnoreCase(email) && userRepository.existsByEmail(email)) {
            throw new BadRequestException("Email already registered");
        }

        user.setName(request.getName().trim());
        user.setEmail(email);
        user.setMobile(request.getMobile());
        user.setRole(resolveRoleForUpdate(user, request.getRole(), principal));
        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }
        user.setAssignedPlants(new HashSet<>(resolvePlants(request.getPlantIds(), principal)));
        user.setAssignedSensorNodes(new HashSet<>(resolveSensorNodes(request.getNodeIds(), request.getPlantIds(), principal)));
        return toResponse(userRepository.save(user));
    }

    @Transactional
    public void disableUser(Long id, UserPrincipal principal) {
        User user = findUser(id);
        assertCanManage(principal, user);
        user.setStatus(UserStatus.DISABLED);
        userRepository.save(user);
    }

    @Transactional
    public void enableUser(Long id, UserPrincipal principal) {
        User user = findUser(id);
        assertCanManage(principal, user);
        user.setStatus(UserStatus.ACTIVE);
        userRepository.save(user);
    }

    @Transactional
    public void deleteUser(Long id) {
        userRepository.delete(findUser(id));
    }

    private User findUser(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + id));
    }

    private boolean isSuperAdmin(UserPrincipal principal) {
        return principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_SUPER_ADMIN"));
    }

    private boolean isManageableByPlantAdmin(User user) {
        return user.getRole() == UserRole.OPERATOR;
    }

    private boolean canPlantAdminAccessUser(UserPrincipal principal, User user) {
        if (user.getAssignedPlants().isEmpty()) {
            return true;
        }
        return user.getAssignedPlants().stream()
                .map(Plant::getPlantId)
                .anyMatch(id -> principal.getPlantIds().contains(id));
    }

    private void assertCanManage(UserPrincipal principal, User user) {
        if (isSuperAdmin(principal)) {
            return;
        }
        if (!isManageableByPlantAdmin(user) || !canPlantAdminAccessUser(principal, user)) {
            throw new AccessDeniedException("You cannot manage this user");
        }
    }

    private UserRole resolveRoleForCreate(UserRole requestedRole, UserPrincipal principal) {
        if (isSuperAdmin(principal)) {
            return requestedRole != null ? requestedRole : UserRole.OPERATOR;
        }
        return UserRole.OPERATOR;
    }

    private UserRole resolveRoleForUpdate(User user, UserRole requestedRole, UserPrincipal principal) {
        if (isSuperAdmin(principal)) {
            return requestedRole != null ? requestedRole : user.getRole();
        }
        return UserRole.OPERATOR;
    }

    private List<Plant> resolvePlants(List<Long> plantIds, UserPrincipal principal) {
        if (plantIds == null || plantIds.isEmpty()) {
            return List.of();
        }
        List<Plant> plants = plantRepository.findAllById(plantIds);
        if (!isSuperAdmin(principal)) {
            for (Plant plant : plants) {
                if (!principal.getPlantIds().contains(plant.getPlantId())) {
                    throw new BadRequestException("Cannot assign plant outside your scope");
                }
            }
        }
        return plants;
    }

    private List<SensorNode> resolveSensorNodes(List<Long> nodeIds, List<Long> plantIds, UserPrincipal principal) {
        if (nodeIds == null || nodeIds.isEmpty()) {
            return List.of();
        }
        List<SensorNode> nodes = sensorNodeRepository.findAllById(nodeIds);
        for (SensorNode node : nodes) {
            Long plantId = node.getPlant().getPlantId();
            if (plantIds != null && !plantIds.isEmpty() && !plantIds.contains(plantId)) {
                throw new BadRequestException("Assigned sensors must belong to selected plants");
            }
            if (!isSuperAdmin(principal) && !principal.getPlantIds().contains(plantId)) {
                throw new BadRequestException("Cannot assign sensor outside your plants");
            }
        }
        return nodes;
    }

    private UserResponse toResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .mobile(user.getMobile())
                .role(user.getRole())
                .status(user.getStatus())
                .plantIds(user.getAssignedPlants().stream().map(Plant::getPlantId).collect(Collectors.toList()))
                .nodeIds(user.getAssignedSensorNodes().stream().map(SensorNode::getNodeId).collect(Collectors.toList()))
                .createdAt(user.getCreatedAt())
                .build();
    }
}
