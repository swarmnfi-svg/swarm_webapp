package com.biopower.service;

import com.biopower.dto.request.DevicePairRequest;
import com.biopower.dto.request.IoTBatchRequest;
import com.biopower.dto.request.SyncReadingsRequest;
import com.biopower.dto.response.DevicePairResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.entity.User;
import com.biopower.model.enums.NodeStatus;
import com.biopower.model.enums.SensorType;
import com.biopower.model.enums.UserRole;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.repository.UserRepository;
import com.biopower.security.UserPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class DeviceService {

    private final SensorNodeRepository sensorNodeRepository;
    private final PlantService plantService;
    private final UserRepository userRepository;
    private final EspProxyService espProxyService;
    private final IoTDataService iotDataService;
    private final PlantAccessService plantAccessService;

    @Transactional
    public DevicePairResponse pairDevice(DevicePairRequest request, UserPrincipal principal) {
        Plant plant = plantService.findPlant(request.getPlantId());
        plantAccessService.assertCanAccessPlant(principal, plant.getPlantId());

        String chipId = request.getChipId().toLowerCase();
        String deviceName = request.getDeviceName() != null && !request.getDeviceName().isBlank()
                ? request.getDeviceName().trim()
                : "ESP-Hub-" + chipId.substring(Math.max(0, chipId.length() - 4));

        List<SensorNode> existing = sensorNodeRepository.findByPlantPlantIdAndDeviceChipId(plant.getPlantId(), chipId);
        boolean newlyPaired = existing.isEmpty();

        if (newlyPaired) {
            SensorNode pendingTemp = claimPendingNode(plant.getPlantId(), SensorType.TEMPERATURE, chipId, deviceName + " Temperature");
            SensorNode pendingHum = claimPendingNode(plant.getPlantId(), SensorType.HUMIDITY, chipId, deviceName + " Humidity");
            SensorNode pendingGas = claimPendingNode(plant.getPlantId(), SensorType.METHANE, chipId, deviceName + " Gas");

            existing = List.of(
                    pendingTemp != null ? pendingTemp : createNode(plant, deviceName + " Temperature", SensorType.TEMPERATURE, chipId),
                    pendingHum != null ? pendingHum : createNode(plant, deviceName + " Humidity", SensorType.HUMIDITY, chipId),
                    pendingGas != null ? pendingGas : createNode(plant, deviceName + " Gas", SensorType.METHANE, chipId)
            );
        }

        Map<SensorType, SensorNode> byType = existing.stream()
                .collect(Collectors.toMap(SensorNode::getSensorType, Function.identity(), (a, b) -> a));

        SensorNode temp = byType.get(SensorType.TEMPERATURE);
        SensorNode hum = byType.get(SensorType.HUMIDITY);
        SensorNode gas = byType.get(SensorType.METHANE);
        if (temp == null || hum == null || gas == null) {
            existing = List.of(
                    temp != null ? temp : createNode(plant, deviceName + " Temperature", SensorType.TEMPERATURE, chipId),
                    hum != null ? hum : createNode(plant, deviceName + " Humidity", SensorType.HUMIDITY, chipId),
                    gas != null ? gas : createNode(plant, deviceName + " Gas", SensorType.METHANE, chipId)
            );
            byType = existing.stream()
                    .collect(Collectors.toMap(SensorNode::getSensorType, Function.identity(), (a, b) -> a));
        }

        Long targetUserId = resolveTargetUserId(request, principal, plant.getPlantId());
        assignPairedResourcesToUser(targetUserId, plant, existing);
        persistDeviceIp(existing, request.getEspIp());

        return DevicePairResponse.builder()
                .chipId(chipId)
                .deviceName(deviceName)
                .plantId(plant.getPlantId())
                .temperatureNodeId(byType.get(SensorType.TEMPERATURE).getNodeId())
                .humidityNodeId(byType.get(SensorType.HUMIDITY).getNodeId())
                .gasNodeId(byType.get(SensorType.METHANE).getNodeId())
                .newlyPaired(newlyPaired)
                .build();
    }

    @Transactional
    public void syncReadings(SyncReadingsRequest request, UserPrincipal principal) {
        plantAccessService.assertCanAccessPlant(principal, request.getPlantId());

        String chipId = request.getChipId().toLowerCase();
        List<SensorNode> nodes = sensorNodeRepository.findByPlantPlantIdAndDeviceChipId(request.getPlantId(), chipId);
        if (nodes.isEmpty()) {
            throw new BadRequestException("No paired device found for chip ID: " + chipId);
        }

        if (plantAccessService.shouldFilterSensorsForOperator(principal)) {
            boolean allowed = nodes.stream()
                    .anyMatch(node -> principal.getNodeIds().contains(node.getNodeId()));
            if (!allowed) {
                throw new AccessDeniedException("You do not have access to this device");
            }
        }

        persistDeviceIp(nodes, request.getIp());

        String statusJson = espProxyService.fetchStatus(request.getIp(), request.getPassword());
        JsonNode status = espProxyService.parseJson(statusJson);

        Map<SensorType, SensorNode> byType = nodes.stream()
                .collect(Collectors.toMap(SensorNode::getSensorType, Function.identity(), (a, b) -> a));

        IoTBatchRequest batch = new IoTBatchRequest();
        batch.setPlantId(request.getPlantId());
        batch.setChipId(chipId);
        if (status.has("rssi") && !status.get("rssi").isNull()) {
            batch.setRssi(status.get("rssi").asInt());
        }

        List<IoTBatchRequest.Reading> readings = new ArrayList<>();
        JsonNode dht = status.get("dht");
        if (dht != null && dht.path("ok").asBoolean(false)) {
            SensorNode tempNode = byType.get(SensorType.TEMPERATURE);
            SensorNode humNode = byType.get(SensorType.HUMIDITY);
            if (tempNode != null) {
                readings.add(reading(tempNode.getNodeId(), SensorType.TEMPERATURE, dht.path("temp").asDouble()));
            }
            if (humNode != null) {
                readings.add(reading(humNode.getNodeId(), SensorType.HUMIDITY, dht.path("humidity").asDouble()));
            }
        }

        JsonNode mq5 = status.get("mq5");
        if (mq5 != null && mq5.path("ok").asBoolean(false)) {
            SensorNode gasNode = byType.get(SensorType.METHANE);
            if (gasNode != null) {
                readings.add(reading(gasNode.getNodeId(), SensorType.METHANE, mq5.path("raw").asDouble()));
            }
        }

        if (readings.isEmpty()) {
            throw new BadRequestException("ESP returned no valid sensor readings");
        }

        batch.setReadings(readings);
        iotDataService.ingestBatch(batch);
    }

    private Long resolveTargetUserId(DevicePairRequest request, UserPrincipal principal, Long plantId) {
        Long assignToUserId = request.getAssignToUserId();
        if (assignToUserId == null || assignToUserId.equals(principal.getId())) {
            return principal.getId();
        }
        if (!plantAccessService.canManageUsers(principal)) {
            throw new AccessDeniedException("Only admins can pair devices for other users");
        }
        User target = userRepository.findById(assignToUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + assignToUserId));
        if (target.getRole() != UserRole.OPERATOR) {
            throw new BadRequestException("Devices can only be assigned to operator accounts");
        }
        if (!plantAccessService.isSuperAdmin(principal)) {
            boolean inScope = target.getAssignedPlants().isEmpty()
                    || target.getAssignedPlants().stream()
                    .anyMatch(plant -> principal.getPlantIds().contains(plant.getPlantId()));
            if (!inScope) {
                throw new AccessDeniedException("You cannot assign devices to this user");
            }
            if (!principal.getPlantIds().contains(plantId)) {
                throw new AccessDeniedException("You cannot pair devices for this plant");
            }
        }
        return assignToUserId;
    }

    private IoTBatchRequest.Reading reading(Long nodeId, SensorType type, double value) {
        IoTBatchRequest.Reading item = new IoTBatchRequest.Reading();
        item.setNodeId(nodeId);
        item.setSensorType(type);
        item.setValue(value);
        return item;
    }

    private void persistDeviceIp(List<SensorNode> nodes, String deviceIp) {
        if (deviceIp == null || deviceIp.isBlank()) {
            return;
        }
        String ip = deviceIp.trim();
        for (SensorNode node : nodes) {
            node.setDeviceIp(ip);
            sensorNodeRepository.save(node);
        }
    }

    private SensorNode createNode(Plant plant, String name, SensorType type, String chipId) {
        SensorNode node = SensorNode.builder()
                .plant(plant)
                .nodeName(name)
                .sensorType(type)
                .deviceChipId(chipId)
                .firmwareVersion("swarm-model-v1")
                .batteryLevel(100)
                .signalStrength(90)
                .status(NodeStatus.ACTIVE)
                .build();
        return sensorNodeRepository.save(node);
    }

    private SensorNode claimPendingNode(Long plantId, SensorType type, String chipId, String nodeName) {
        return sensorNodeRepository.findByPlantPlantIdAndSensorTypeAndDeviceChipIdIsNull(plantId, type).stream()
                .filter(node -> node.getNodeName() != null && node.getNodeName().startsWith("Pending ESP"))
                .findFirst()
                .map(node -> {
                    node.setDeviceChipId(chipId);
                    node.setNodeName(nodeName);
                    if (node.getFirmwareVersion() == null || node.getFirmwareVersion().isBlank()) {
                        node.setFirmwareVersion("swarm-model-v1");
                    }
                    return sensorNodeRepository.save(node);
                })
                .orElse(null);
    }

    private void assignPairedResourcesToUser(Long userId, Plant plant, List<SensorNode> nodes) {
        if (userId == null) {
            return;
        }
        userRepository.findById(userId).ifPresent(user -> {
            boolean updated = false;
            if (!user.getAssignedPlants().contains(plant)) {
                user.getAssignedPlants().add(plant);
                updated = true;
            }
            for (SensorNode node : nodes) {
                if (!user.getAssignedSensorNodes().contains(node)) {
                    user.getAssignedSensorNodes().add(node);
                    updated = true;
                }
            }
            if (updated) {
                userRepository.save(user);
            }
        });
    }
}