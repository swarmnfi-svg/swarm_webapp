package com.biopower.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SyncReadingsRequest {
    @NotBlank
    private String ip;
    @NotBlank
    private String password;
    @NotNull
    private Long plantId;
    @NotBlank
    private String chipId;
    /** When set, readings are taken from the browser (LAN) instead of server-side ESP proxy. */
    private EspStatusSnapshot status;
}
