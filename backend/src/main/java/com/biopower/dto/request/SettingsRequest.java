package com.biopower.dto.request;

import lombok.Data;

@Data
public class SettingsRequest {
    private String settingKey;
    private String settingValue;
    private String category;
    private String description;
}
