package com.biopower.repository;

import com.biopower.model.entity.AiRecommendation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface AiRecommendationRepository extends JpaRepository<AiRecommendation, Long> {
    List<AiRecommendation> findByPlantIdOrderByCreatedAtDesc(Long plantId);
    Optional<AiRecommendation> findFirstByPlantIdOrderByCreatedAtDesc(Long plantId);
    List<AiRecommendation> findByPlantIdAndAcknowledgedFalse(Long plantId);

    @Modifying
    @Query("DELETE FROM AiRecommendation r WHERE r.plantId = :plantId")
    void deleteByPlantId(@Param("plantId") Long plantId);

    @Modifying
    @Query("DELETE FROM AiRecommendation r WHERE r.createdAt < :cutoff")
    int deleteByCreatedAtBefore(@Param("cutoff") LocalDateTime cutoff);
}
