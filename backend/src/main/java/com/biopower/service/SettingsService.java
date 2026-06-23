package com.biopower.service;

import com.biopower.dto.request.SettingsRequest;
import com.biopower.model.entity.SystemSettings;
import com.biopower.repository.SystemSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SettingsService {

    private final SystemSettingsRepository settingsRepository;

    @Transactional(readOnly = true)
    public List<SystemSettings> getAllSettings() {
        return settingsRepository.findAll();
    }

    @Transactional(readOnly = true)
    public List<SystemSettings> getByCategory(String category) {
        return settingsRepository.findByCategory(category);
    }

    @Transactional(readOnly = true)
    public Map<String, String> getSettingsMap() {
        return settingsRepository.findAll().stream()
                .collect(Collectors.toMap(SystemSettings::getSettingKey, SystemSettings::getSettingValue));
    }

    @Transactional
    public SystemSettings saveSetting(SettingsRequest request) {
        SystemSettings setting = settingsRepository.findBySettingKey(request.getSettingKey())
                .orElse(SystemSettings.builder().settingKey(request.getSettingKey()).build());
        setting.setSettingValue(request.getSettingValue());
        setting.setCategory(request.getCategory());
        setting.setDescription(request.getDescription());
        return settingsRepository.save(setting);
    }

    @Transactional
    public void initializeDefaults() {
        saveIfAbsent("alert.ph.min", "6.5", "ALERT", "Minimum pH threshold");
        saveIfAbsent("alert.ph.max", "8.5", "ALERT", "Maximum pH threshold");
        saveIfAbsent("alert.temp.min", "25", "ALERT", "Minimum temperature °C");
        saveIfAbsent("alert.temp.max", "45", "ALERT", "Maximum temperature °C");
        saveIfAbsent("alert.pressure.max", "2.5", "ALERT", "Maximum pressure bar");
        saveIfAbsent("mqtt.broker.url", "tcp://localhost:1883", "MQTT", "MQTT broker URL");
        saveIfAbsent("mqtt.topic", "biopower/sensors/#", "MQTT", "MQTT subscription topic");
        saveIfAbsent("mail.smtp.host", "smtp.gmail.com", "EMAIL", "SMTP host");
        saveIfAbsent("ai.analysis.interval", "300", "AI", "AI analysis interval seconds");
        saveIfAbsent("report.schedule.daily", "06:00", "REPORT", "Daily report generation time");
    }

    private void saveIfAbsent(String key, String value, String category, String description) {
        if (settingsRepository.findBySettingKey(key).isEmpty()) {
            settingsRepository.save(SystemSettings.builder()
                    .settingKey(key)
                    .settingValue(value)
                    .category(category)
                    .description(description)
                    .build());
        }
    }
}
