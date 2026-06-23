package com.biopower.dto.response;

import com.biopower.model.enums.UserRole;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class AuthResponse {
    private String token;
    private String type;
    private Long id;
    private String name;
    private String email;
    private UserRole role;
    private List<Long> plantIds;
}
