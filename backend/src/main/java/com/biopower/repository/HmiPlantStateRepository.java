package com.biopower.repository;

import com.biopower.model.entity.HmiPlantState;
import org.springframework.data.jpa.repository.JpaRepository;

public interface HmiPlantStateRepository extends JpaRepository<HmiPlantState, Long> {
}
