package com.biopower.dto.request;

import com.biopower.model.enums.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class UserRequest {
    @NotBlank
    private String name;
    @NotBlank @Email
    private String email;
    private String mobile;
    private String password;
    @NotNull
    private UserRole role;
    private List<Long> plantIds;
    private List<Long> nodeIds;
}
