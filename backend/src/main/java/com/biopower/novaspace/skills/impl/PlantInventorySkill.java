package com.biopower.novaspace.skills.impl;

import com.biopower.model.entity.Plant;
import com.biopower.model.enums.NodeStatus;
import com.biopower.novaspace.facts.FactPack;
import com.biopower.novaspace.facts.MetricFact;
import com.biopower.novaspace.facts.ProvenanceLink;
import com.biopower.novaspace.facts.QualityFlag;
import com.biopower.novaspace.skills.NovaSkill;
import com.biopower.novaspace.skills.NovaSkillContext;
import com.biopower.novaspace.skills.NovaSkillResult;
import com.biopower.novaspace.skills.NovaToolIds;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.service.PlantAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class PlantInventorySkill implements NovaSkill {

    private final PlantAccessService plantAccessService;
    private final PlantRepository plantRepository;
    private final SensorNodeRepository sensorNodeRepository;

    @Override
    public String toolId() {
        return NovaToolIds.PLANT_INVENTORY;
    }

    @Override
    public NovaSkillResult execute(NovaSkillContext ctx) {
        List<Long> plantIds = plantAccessService.resolveAccessiblePlantIds(ctx.principal());
        if (plantIds.isEmpty()) {
            return NovaSkillResult.success(FactPack.empty(
                    "You do not have access to any plants in SWARM."));
        }

        List<MetricFact> metrics = new ArrayList<>();
        int connectedPlants = 0;
        long totalSensors = 0;
        long onlineSensors = 0;
        StringBuilder detail = new StringBuilder();

        for (Long plantId : plantIds) {
            Plant plant = plantRepository.findById(plantId).orElse(null);
            if (plant == null) {
                continue;
            }
            long sensorCount = sensorNodeRepository.findByPlantPlantId(plantId).size();
            long activeCount = sensorNodeRepository.countByPlantPlantIdAndStatus(plantId, NodeStatus.ACTIVE);
            totalSensors += sensorCount;
            onlineSensors += activeCount;
            if (sensorCount > 0) {
                connectedPlants++;
            }
            detail.append("- **").append(plant.getPlantName()).append("** — ")
                    .append(activeCount).append(" sensor").append(activeCount == 1 ? "" : "s")
                    .append(" online (").append(sensorCount).append(" total)\n");
        }

        metrics.add(MetricFact.builder()
                .metric("PLANT_COUNT")
                .value((double) plantIds.size())
                .unit("plants")
                .quality(QualityFlag.GOOD)
                .build());
        metrics.add(MetricFact.builder()
                .metric("CONNECTED_PLANTS")
                .value((double) connectedPlants)
                .unit("plants")
                .quality(QualityFlag.GOOD)
                .build());
        metrics.add(MetricFact.builder()
                .metric("ONLINE_SENSORS")
                .value((double) onlineSensors)
                .unit("sensors")
                .quality(QualityFlag.GOOD)
                .build());

        String summary = "You have access to **" + plantIds.size() + " plant"
                + (plantIds.size() == 1 ? "" : "s") + "** in SWARM"
                + (connectedPlants > 0
                ? " (" + connectedPlants + " with connected sensors, " + onlineSensors + " sensors online overall)"
                : "")
                + ":\n\n" + detail.toString().trim();

        return NovaSkillResult.success(FactPack.builder()
                .metrics(metrics)
                .links(List.of(new ProvenanceLink("Plants", "/plants", toolId())))
                .summaryNote(summary)
                .build());
    }
}
