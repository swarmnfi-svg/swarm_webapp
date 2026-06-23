package com.biopower.service;

import com.biopower.dto.request.ChangePasswordRequest;
import com.biopower.dto.request.ForgotPasswordRequest;
import com.biopower.dto.request.LoginRequest;
import com.biopower.dto.response.AuthResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.User;
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

import java.util.stream.Collectors;

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
        String token = tokenProvider.generateToken(authentication);
        UserPrincipal principal = (UserPrincipal) authentication.getPrincipal();

        return AuthResponse.builder()
                .token(token)
                .type("Bearer")
                .id(principal.getId())
                .name(principal.getName())
                .email(principal.getEmail())
                .role(com.biopower.model.enums.UserRole.valueOf(
                        principal.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "")))
                .plantIds(principal.getPlantIds())
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
