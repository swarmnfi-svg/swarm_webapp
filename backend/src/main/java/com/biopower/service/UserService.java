package com.biopower.service;

import com.biopower.dto.request.UserRequest;
import com.biopower.dto.response.UserResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.User;
import com.biopower.model.enums.UserStatus;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.UserRepository;
import lombok.RequiredArgsConstructor;
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
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public List<UserResponse> getAllUsers() {
        return userRepository.findAll().stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public UserResponse getUserById(Long id) {
        return toResponse(findUser(id));
    }

    @Transactional
    public UserResponse createUser(UserRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already registered");
        }
        User user = User.builder()
                .name(request.getName())
                .email(request.getEmail())
                .mobile(request.getMobile())
                .password(passwordEncoder.encode(request.getPassword()))
                .role(request.getRole())
                .status(UserStatus.ACTIVE)
                .assignedPlants(new HashSet<>(resolvePlants(request.getPlantIds())))
                .build();
        return toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateUser(Long id, UserRequest request) {
        User user = findUser(id);
        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setMobile(request.getMobile());
        user.setRole(request.getRole());
        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }
        if (request.getPlantIds() != null) {
            user.setAssignedPlants(new HashSet<>(resolvePlants(request.getPlantIds())));
        }
        return toResponse(userRepository.save(user));
    }

    @Transactional
    public void disableUser(Long id) {
        User user = findUser(id);
        user.setStatus(UserStatus.DISABLED);
        userRepository.save(user);
    }

    @Transactional
    public void enableUser(Long id) {
        User user = findUser(id);
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

    private List<Plant> resolvePlants(List<Long> plantIds) {
        if (plantIds == null || plantIds.isEmpty()) return List.of();
        return plantRepository.findAllById(plantIds);
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
                .createdAt(user.getCreatedAt())
                .build();
    }
}
