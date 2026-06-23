package com.biopower.repository;

import com.biopower.model.entity.AiRecommendation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AiRecommendationRepository extends JpaRepository<AiRecommendation, Long> {
    List<AiRecommendation> findByPlantIdOrderByCreatedAtDesc(Long plantId);
    Optional<AiRecommendation> findFirstByPlantIdOrderByCreatedAtDesc(Long plantId);
    List<AiRecommendation> findByPlantIdAndAcknowledgedFalse(Long plantId);
}
