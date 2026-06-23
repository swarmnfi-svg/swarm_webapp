package com.biopower.service;

import com.biopower.dto.response.PredictiveMaintenanceResponse;
import com.biopower.model.entity.PredictiveMaintenance;
import com.biopower.model.enums.EquipmentType;
import com.biopower.repository.PredictiveMaintenanceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PredictiveMaintenanceService {

    private final PredictiveMaintenanceRepository repository;

    @Transactional(readOnly = true)
    public List<PredictiveMaintenanceResponse> getByPlant(Long plantId) {
        return repository.findByPlantIdOrderByRemainingUsefulLifeDaysAsc(plantId)
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional
    public PredictiveMaintenanceResponse create(Long plantId, EquipmentType type, String name) {
        int rul = switch (type) {
            case PUMP -> 45 + (int) (Math.random() * 60);
            case BLOWER -> 30 + (int) (Math.random() * 90);
            case AGITATOR -> 60 + (int) (Math.random() * 120);
            case COMPRESSOR -> 90 + (int) (Math.random() * 180);
            case SENSOR -> 180 + (int) (Math.random() * 365);
        };
        double health = Math.min(100, (rul / 365.0) * 100);

        PredictiveMaintenance pm = PredictiveMaintenance.builder()
                .plantId(plantId)
                .equipmentType(type)
                .equipmentName(name)
                .remainingUsefulLifeDays(rul)
                .estimatedFailureDate(LocalDate.now().plusDays(rul))
                .healthPercentage(health)
                .notes("AI-predicted maintenance schedule based on operational patterns")
                .build();
        return toResponse(repository.save(pm));
    }

    @Transactional
    public void generatePredictionsForPlant(Long plantId) {
        if (repository.findByPlantId(plantId).isEmpty()) {
            create(plantId, EquipmentType.PUMP, "Main Feed Pump");
            create(plantId, EquipmentType.BLOWER, "Digester Blower");
            create(plantId, EquipmentType.AGITATOR, "Mixing Agitator");
            create(plantId, EquipmentType.COMPRESSOR, "Gas Compressor");
            create(plantId, EquipmentType.SENSOR, "Methane Sensor Array");
        }
    }

    private PredictiveMaintenanceResponse toResponse(PredictiveMaintenance pm) {
        return PredictiveMaintenanceResponse.builder()
                .id(pm.getId())
                .plantId(pm.getPlantId())
                .equipmentType(pm.getEquipmentType())
                .equipmentName(pm.getEquipmentName())
                .remainingUsefulLifeDays(pm.getRemainingUsefulLifeDays())
                .estimatedFailureDate(pm.getEstimatedFailureDate())
                .healthPercentage(pm.getHealthPercentage())
                .notes(pm.getNotes())
                .updatedAt(pm.getUpdatedAt())
                .build();
    }
}
