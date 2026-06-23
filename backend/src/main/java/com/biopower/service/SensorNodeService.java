package com.biopower.service;

import com.biopower.dto.request.SensorNodeRequest;
import com.biopower.dto.response.SensorNodeResponse;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.enums.NodeStatus;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.repository.SensorReadingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SensorNodeService {

    private final SensorNodeRepository sensorNodeRepository;
    private final SensorReadingRepository sensorReadingRepository;
    private final PlantService plantService;

    @Transactional(readOnly = true)
    public List<SensorNodeResponse> getAllNodes() {
        return sensorNodeRepository.findAll().stream().map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<SensorNodeResponse> getNodesByPlant(Long plantId) {
        return sensorNodeRepository.findByPlantPlantId(plantId).stream()
                .map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public SensorNodeResponse getNodeById(Long id) {
        return toResponse(findNode(id));
    }

    @Transactional
    public SensorNodeResponse createNode(SensorNodeRequest request) {
        Plant plant = plantService.findPlant(request.getPlantId());
        SensorNode node = SensorNode.builder()
                .plant(plant)
                .nodeName(request.getNodeName())
                .sensorType(request.getSensorType())
                .firmwareVersion(request.getFirmwareVersion())
                .batteryLevel(request.getBatteryLevel())
                .signalStrength(request.getSignalStrength())
                .status(request.getStatus() != null ? request.getStatus() : NodeStatus.ACTIVE)
                .build();
        return toResponse(sensorNodeRepository.save(node));
    }

    @Transactional
    public SensorNodeResponse updateNode(Long id, SensorNodeRequest request) {
        SensorNode node = findNode(id);
        node.setNodeName(request.getNodeName());
        node.setSensorType(request.getSensorType());
        node.setFirmwareVersion(request.getFirmwareVersion());
        node.setBatteryLevel(request.getBatteryLevel());
        node.setSignalStrength(request.getSignalStrength());
        if (request.getStatus() != null) node.setStatus(request.getStatus());
        return toResponse(sensorNodeRepository.save(node));
    }

    @Transactional
    public SensorNodeResponse toggleNode(Long id, boolean enable) {
        SensorNode node = findNode(id);
        node.setStatus(enable ? NodeStatus.ACTIVE : NodeStatus.INACTIVE);
        return toResponse(sensorNodeRepository.save(node));
    }

    @Transactional
    public void deleteNode(Long id) {
        sensorNodeRepository.delete(findNode(id));
    }

    public SensorNode findNode(Long id) {
        return sensorNodeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Sensor node not found: " + id));
    }

    private SensorNodeResponse toResponse(SensorNode node) {
        Double lastValue = sensorReadingRepository.findFirstByNodeIdOrderByRecordedAtDesc(node.getNodeId())
                .map(r -> r.getValue()).orElse(null);

        return SensorNodeResponse.builder()
                .nodeId(node.getNodeId())
                .plantId(node.getPlant().getPlantId())
                .plantName(node.getPlant().getPlantName())
                .nodeName(node.getNodeName())
                .sensorType(node.getSensorType())
                .firmwareVersion(node.getFirmwareVersion())
                .batteryLevel(node.getBatteryLevel())
                .signalStrength(node.getSignalStrength())
                .status(node.getStatus())
                .lastValue(lastValue)
                .lastReadingAt(node.getLastReadingAt())
                .createdAt(node.getCreatedAt())
                .build();
    }
}
