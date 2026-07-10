package com.biopower.service;

import com.biopower.dto.request.SensorNodeRequest;
import com.biopower.dto.response.SensorNodeResponse;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.enums.NodeStatus;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.repository.SensorReadingRepository;
import com.biopower.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
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
    public List<SensorNodeResponse> getAllNodes(UserPrincipal principal) {
        return filterNodesForPrincipal(sensorNodeRepository.findAll(), principal).stream()
                .map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<SensorNodeResponse> getNodesByPlant(Long plantId, UserPrincipal principal) {
        assertCanManagePlant(principal, plantId);
        return sensorNodeRepository.findByPlantPlantId(plantId).stream()
                .map(this::toResponse).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public SensorNodeResponse getNodeById(Long id) {
        return toResponse(findNode(id));
    }

    @Transactional
    public SensorNodeResponse createNode(SensorNodeRequest request, UserPrincipal principal) {
        assertCanManagePlant(principal, request.getPlantId());
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
    public SensorNodeResponse updateNode(Long id, SensorNodeRequest request, UserPrincipal principal) {
        SensorNode node = findNode(id);
        assertCanManagePlant(principal, node.getPlant().getPlantId());
        if (!node.getPlant().getPlantId().equals(request.getPlantId())) {
            assertCanManagePlant(principal, request.getPlantId());
        }
        node.setNodeName(request.getNodeName());
        node.setSensorType(request.getSensorType());
        node.setFirmwareVersion(request.getFirmwareVersion());
        node.setBatteryLevel(request.getBatteryLevel());
        node.setSignalStrength(request.getSignalStrength());
        if (request.getStatus() != null) node.setStatus(request.getStatus());
        return toResponse(sensorNodeRepository.save(node));
    }

    @Transactional
    public SensorNodeResponse toggleNode(Long id, boolean enable, UserPrincipal principal) {
        SensorNode node = findNode(id);
        assertCanManagePlant(principal, node.getPlant().getPlantId());
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
                .deviceChipId(node.getDeviceChipId())
                .deviceIp(node.getDeviceIp())
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

    private List<SensorNode> filterNodesForPrincipal(List<SensorNode> nodes, UserPrincipal principal) {
        if (isSuperAdmin(principal)) {
            return nodes;
        }
        return nodes.stream()
                .filter(node -> principal.getPlantIds().contains(node.getPlant().getPlantId()))
                .collect(Collectors.toList());
    }

    private boolean isSuperAdmin(UserPrincipal principal) {
        return principal.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_SUPER_ADMIN"));
    }

    private void assertCanManagePlant(UserPrincipal principal, Long plantId) {
        if (!isSuperAdmin(principal) && !principal.getPlantIds().contains(plantId)) {
            throw new AccessDeniedException("You cannot manage sensors for this plant");
        }
    }
}
