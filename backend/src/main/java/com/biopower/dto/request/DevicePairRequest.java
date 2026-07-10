package com.biopower.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class DevicePairRequest {
    @NotNull
    private Long plantId;
    @NotBlank
    private String chipId;
    private String deviceName;
    private String espIp;
    /** When set by admin/manager, paired plant + sensors are assigned to this operator. */
    private Long assignToUserId;
}
