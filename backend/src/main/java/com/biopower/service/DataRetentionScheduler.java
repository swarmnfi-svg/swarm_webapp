package com.biopower.service;

import com.biopower.model.entity.AiRecommendation;
import com.biopower.novaspace.model.NovaThread;
import com.biopower.novaspace.repository.NovaMessageRepository;
import com.biopower.novaspace.repository.NovaThreadRepository;
import com.biopower.repository.AiRecommendationRepository;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorReadingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataRetentionScheduler {

    private final SensorReadingRepository sensorReadingRepository;
    private final AiRecommendationRepository aiRecommendationRepository;
    private final PlantRepository plantRepository;
    private final NovaThreadRepository novaThreadRepository;
    private final NovaMessageRepository novaMessageRepository;

    @Value("${biopower.retention.sensor-readings-days:30}")
    private int sensorRetentionDays;

    @Value("${biopower.retention.ai-recommendations-days:30}")
    private int aiRetentionDays;

    @Value("${biopower.retention.ai-recommendations-per-plant:100}")
    private int aiRecommendationsPerPlant;

    @Value("${biopower.retention.nova-messages-days:90}")
    private int novaMessageRetentionDays;

    @Scheduled(cron = "0 30 2 * * *")
    @Transactional
    public void purgeOldData() {
        LocalDateTime now = LocalDateTime.now();
        int sensorDeleted = sensorReadingRepository.deleteByRecordedAtBefore(
                now.minusDays(sensorRetentionDays));
        int aiDeleted = aiRecommendationRepository.deleteByCreatedAtBefore(
                now.minusDays(aiRetentionDays));
        int aiTrimmed = trimAiRecommendationsPerPlant();
        int novaDeleted = purgeStaleNovaThreads(now.minusDays(novaMessageRetentionDays));

        log.info(
                "Data retention complete: sensor_readings={}, ai_recommendations_by_age={}, "
                        + "ai_recommendations_trimmed={}, nova_threads={}",
                sensorDeleted,
                aiDeleted,
                aiTrimmed,
                novaDeleted);
    }

    private int trimAiRecommendationsPerPlant() {
        int trimmed = 0;
        for (Long plantId : plantRepository.findAll().stream().map(p -> p.getPlantId()).toList()) {
            List<AiRecommendation> recs =
                    aiRecommendationRepository.findByPlantIdOrderByCreatedAtDesc(plantId);
            if (recs.size() <= aiRecommendationsPerPlant) {
                continue;
            }
            List<Long> staleIds = recs.subList(aiRecommendationsPerPlant, recs.size()).stream()
                    .map(AiRecommendation::getId)
                    .toList();
            aiRecommendationRepository.deleteAllById(staleIds);
            trimmed += staleIds.size();
        }
        return trimmed;
    }

    private int purgeStaleNovaThreads(LocalDateTime cutoff) {
        List<NovaThread> staleThreads = novaThreadRepository.findByUpdatedAtBefore(cutoff);
        if (staleThreads.isEmpty()) {
            return 0;
        }
        for (NovaThread thread : staleThreads) {
            novaMessageRepository.deleteByThreadId(thread.getId());
        }
        novaThreadRepository.deleteAll(staleThreads);
        return staleThreads.size();
    }
}
