package com.biopower.service;

import com.biopower.dto.request.ChangePasswordRequest;
import com.biopower.dto.request.ForgotPasswordRequest;
import com.biopower.dto.request.LoginRequest;
import com.biopower.dto.request.SignupRequest;
import com.biopower.dto.response.AuthResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.User;
import com.biopower.model.enums.UserRole;
import com.biopower.model.enums.UserStatus;
import com.biopower.repository.UserRepository;
import com.biopower.security.JwtTokenProvider;
import com.biopower.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;

    public AuthResponse login(LoginRequest request) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));
        return toAuthResponse(authentication);
    }

    @Transactional
    public AuthResponse signup(SignupRequest request) {
        String email = request.getEmail().trim();
        if (userRepository.existsByEmail(email)) {
            throw new BadRequestException("Email already registered");
        }

        User user = User.builder()
                .name(request.getName().trim())
                .email(email)
                .mobile(request.getMobile() != null ? request.getMobile().trim() : null)
                .password(passwordEncoder.encode(request.getPassword()))
                .role(UserRole.OPERATOR)
                .status(UserStatus.ACTIVE)
                .assignedPlants(new HashSet<>())
                .assignedSensorNodes(new HashSet<>())
                .build();
        user = userRepository.save(user);

        UserPrincipal principal = UserPrincipal.create(user);
        Authentication authentication = new UsernamePasswordAuthenticationToken(
                principal, null, principal.getAuthorities());
        return toAuthResponse(authentication);
    }

    private AuthResponse toAuthResponse(Authentication authentication) {
        String token = tokenProvider.generateToken(authentication);
        UserPrincipal principal = (UserPrincipal) authentication.getPrincipal();

        return AuthResponse.builder()
                .token(token)
                .type("Bearer")
                .id(principal.getId())
                .name(principal.getName())
                .email(principal.getEmail())
                .role(UserRole.valueOf(
                        principal.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "")))
                .plantIds(principal.getPlantIds())
                .nodeIds(principal.getNodeIds())
                .build();
    }

    @Transactional(readOnly = true)
    public AuthResponse getCurrentUser(UserPrincipal principal) {
        return AuthResponse.builder()
                .id(principal.getId())
                .name(principal.getName())
                .email(principal.getEmail())
                .role(com.biopower.model.enums.UserRole.valueOf(
                        principal.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "")))
                .plantIds(principal.getPlantIds())
                .nodeIds(principal.getNodeIds())
                .build();
    }

    @Transactional
    public void forgotPassword(ForgotPasswordRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new ResourceNotFoundException("User not found with email: " + request.getEmail()));
        log.info("Password reset requested for user: {}. Email notification ready.", user.getEmail());
    }

    @Transactional
    public void changePassword(Long userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new BadRequestException("Current password is incorrect");
        }
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }
}
