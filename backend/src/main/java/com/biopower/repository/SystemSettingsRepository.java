package com.biopower.repository;

import com.biopower.model.entity.SystemSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SystemSettingsRepository extends JpaRepository<SystemSettings, Long> {
    Optional<SystemSettings> findBySettingKey(String settingKey);
    List<SystemSettings> findByCategory(String category);
}
