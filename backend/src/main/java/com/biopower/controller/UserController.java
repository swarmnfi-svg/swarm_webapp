package com.biopower.controller;

import com.biopower.dto.request.UserRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.UserResponse;
import com.biopower.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<UserResponse>>> getAllUsers() {
        return ResponseEntity.ok(ApiResponse.success(userService.getAllUsers()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> getUser(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(userService.getUserById(id)));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<UserResponse>> createUser(@Valid @RequestBody UserRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("User created", userService.createUser(request)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<UserResponse>> updateUser(
            @PathVariable Long id, @Valid @RequestBody UserRequest request) {
        return ResponseEntity.ok(ApiResponse.success("User updated", userService.updateUser(id, request)));
    }

    @PatchMapping("/{id}/disable")
    public ResponseEntity<ApiResponse<Void>> disableUser(@PathVariable Long id) {
        userService.disableUser(id);
        return ResponseEntity.ok(ApiResponse.success("User disabled", null));
    }

    @PatchMapping("/{id}/enable")
    public ResponseEntity<ApiResponse<Void>> enableUser(@PathVariable Long id) {
        userService.enableUser(id);
        return ResponseEntity.ok(ApiResponse.success("User enabled", null));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
        return ResponseEntity.ok(ApiResponse.success("User deleted", null));
    }
}
