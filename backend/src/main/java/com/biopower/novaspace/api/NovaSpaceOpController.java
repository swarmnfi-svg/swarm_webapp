package com.biopower.novaspace.api;

import com.biopower.dto.response.ApiResponse;
import com.biopower.novaspace.core.NovaSpaceOpService;
import com.biopower.novaspace.model.NovaMessage;
import com.biopower.novaspace.model.NovaThread;
import com.biopower.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/nova-space-op")
@RequiredArgsConstructor
public class NovaSpaceOpController {

    private final NovaSpaceOpService novaSpaceOpService;

    @PostMapping("/chat")
    public ResponseEntity<ApiResponse<NovaSpaceOpChatResponse>> chat(
            @Valid @RequestBody NovaChatRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(novaSpaceOpService.chat(principal, request)));
    }

    @GetMapping("/threads")
    public ResponseEntity<ApiResponse<List<NovaThread>>> listThreads(
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(novaSpaceOpService.listThreads(principal)));
    }

    @GetMapping("/threads/{id}/messages")
    public ResponseEntity<ApiResponse<List<NovaMessage>>> getMessages(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(ApiResponse.success(novaSpaceOpService.getMessages(principal, id)));
    }

    @PostMapping("/threads/{id}/clear")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> clearThread(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal principal) {
        novaSpaceOpService.clearThread(principal, id);
        return ResponseEntity.ok(ApiResponse.success(Map.of("cleared", true)));
    }
}
