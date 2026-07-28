package com.biopower.service;

import com.biopower.dto.request.HmiCommandRequest;
import com.biopower.dto.request.HmiMasterRequest;
import com.biopower.dto.response.HmiDiagramResponse;
import com.biopower.dto.response.HmiEquipmentStateResponse;
import com.biopower.dto.response.HmiHotspotResponse;
import com.biopower.dto.response.HmiStateResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.*;
import com.biopower.model.enums.AlertStatus;
import com.biopower.model.enums.HmiControlMode;
import com.biopower.model.enums.SensorType;
import com.biopower.repository.*;
import com.biopower.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class HmiService {

    private static final String DIAGRAM_URL = "/hmi/biogas-pfd.html";
    private static final String PID_REFERENCE = "Biogas Plant PFD — block diagram HMI (Tata Steel West Bokaro)";

    private final HmiEquipmentRepository equipmentRepository;
    private final HmiEquipmentStateRepository equipmentStateRepository;
    private final HmiPlantStateRepository plantStateRepository;
    private final PlantRepository plantRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final SensorReadingRepository sensorReadingRepository;
    private final AlertRepository alertRepository;
    private final PlantAccessService plantAccessService;
    private final HmiPlantSetupService hmiPlantSetupService;

    @Transactional(readOnly = true)
    public HmiDiagramResponse getDiagram(Long plantId, UserPrincipal principal) {
        plantAccessService.assertCanAccessPlant(principal, plantId);
        Plant plant = plantRepository.findById(plantId)
                .orElseThrow(() -> new ResourceNotFoundException("Plant not found"));
        ensureEquipmentSeeded(plantId);

        List<HmiHotspotResponse> hotspots = equipmentRepository.findByPlantIdOrderBySequenceOrderAsc(plantId).stream()
                .map(eq -> HmiHotspotResponse.builder()
                        .tagNo(eq.getTagNo())
                        .name(eq.getName())
                        .zone(eq.getZone().name())
                        .x(eq.getHotspotX() != null ? eq.getHotspotX() : 0)
                        .y(eq.getHotspotY() != null ? eq.getHotspotY() : 0)
                        .w(eq.getHotspotW() != null ? eq.getHotspotW() : 4)
                        .h(eq.getHotspotH() != null ? eq.getHotspotH() : 3)
                        .build())
                .toList();

        return HmiDiagramResponse.builder()
                .plantId(plantId)
                .plantName(plant.getPlantName())
                .diagramImageUrl(DIAGRAM_URL)
                .pidReference(PID_REFERENCE)
                .simulationMode(true)
                .hotspots(hotspots)
                .build();
    }

    @Transactional(readOnly = true)
    public HmiStateResponse getState(Long plantId, UserPrincipal principal) {
        plantAccessService.assertCanAccessPlant(principal, plantId);
        ensureEquipmentSeeded(plantId);
        HmiPlantState plantState = getOrCreatePlantState(plantId);

        Map<Long, SensorNode> nodesById = sensorNodeRepository.findByPlantPlantId(plantId).stream()
                .collect(Collectors.toMap(SensorNode::getNodeId, n -> n));
        Set<Long> alarmNodeIds = alertRepository.findByPlantIdAndStatus(plantId, AlertStatus.ACTIVE).stream()
                .map(Alert::getNodeId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        List<HmiEquipment> equipment = equipmentRepository.findByPlantIdOrderBySequenceOrderAsc(plantId);
        Map<Long, HmiEquipmentState> stateByEquipmentId = equipmentStateRepository.findByPlantId(plantId).stream()
                .collect(Collectors.toMap(s -> s.getEquipment().getId(), s -> s));

        List<String> alarmTags = new ArrayList<>();
        List<HmiEquipmentStateResponse> items = new ArrayList<>();
        int runningCount = 0;

        for (HmiEquipment eq : equipment) {
            HmiEquipmentState st = stateByEquipmentId.get(eq.getId());
            if (st == null && eq.isControllable()) {
                st = HmiEquipmentState.builder()
                        .plantId(plantId)
                        .equipment(eq)
                        .powered(false)
                        .running(false)
                        .mode(HmiControlMode.OFF)
                        .build();
            } else if (st == null) {
                st = HmiEquipmentState.builder()
                        .plantId(plantId)
                        .equipment(eq)
                        .powered(false)
                        .running(false)
                        .mode(HmiControlMode.OFF)
                        .build();
            }
            if (eq.isControllable() && st.isRunning()) {
                runningCount++;
            }

            SensorNode node = eq.getSensorNodeId() != null ? nodesById.get(eq.getSensorNodeId()) : null;
            Double value = null;
            if (node != null) {
                value = sensorReadingRepository.findFirstByNodeIdOrderByRecordedAtDesc(node.getNodeId())
                        .map(SensorReading::getValue)
                        .orElse(null);
            }
            boolean inAlarm = node != null && alarmNodeIds.contains(node.getNodeId());
            if (inAlarm) {
                alarmTags.add(eq.getTagNo());
            }

            items.add(HmiEquipmentStateResponse.builder()
                    .equipmentId(eq.getId())
                    .tagNo(eq.getTagNo())
                    .name(eq.getName())
                    .zone(eq.getZone().name())
                    .equipmentKind(eq.getEquipmentKind().name())
                    .controllable(eq.isControllable())
                    .powered(st.isPowered())
                    .running(st.isRunning())
                    .mode(st.getMode().name())
                    .sequenceOrder(eq.getSequenceOrder())
                    .motorHp(eq.getMotorHp())
                    .capacity(eq.getCapacity())
                    .sensorNodeId(eq.getSensorNodeId())
                    .sensorNodeName(node != null ? node.getNodeName() : null)
                    .sensorValue(value)
                    .sensorUnit(node != null ? sensorUnit(node.getSensorType()) : null)
                    .sensorType(node != null ? node.getSensorType().name() : null)
                    .inAlarm(inAlarm)
                    .build());
        }

        int controllableCount = (int) equipment.stream().filter(HmiEquipment::isControllable).count();

        return HmiStateResponse.builder()
                .plantId(plantId)
                .plantPowered(plantState.isPlantPowered())
                .autoSequenceActive(plantState.isAutoSequenceActive())
                .autoSequenceStep(plantState.getAutoSequenceStep() != null ? plantState.getAutoSequenceStep() : 0)
                .runningCount(runningCount)
                .controllableCount(controllableCount)
                .simulationMode(true)
                .equipment(items)
                .alarmTags(alarmTags)
                .build();
    }

    @Transactional
    public HmiStateResponse applyCommand(Long plantId, HmiCommandRequest request, UserPrincipal principal) {
        assertCanControl(principal);
        plantAccessService.assertCanAccessPlant(principal, plantId);
        HmiEquipment equipment = equipmentRepository.findByPlantIdAndTagNo(plantId, request.getTagNo())
                .orElseThrow(() -> new ResourceNotFoundException("Equipment not found: " + request.getTagNo()));
        if (!equipment.isControllable()) {
            throw new BadRequestException("Equipment " + request.getTagNo() + " is not controllable");
        }

        HmiPlantState plantState = getOrCreatePlantState(plantId);
        if (!plantState.isPlantPowered() && !"POWER_ON".equalsIgnoreCase(request.getAction())) {
            throw new BadRequestException("Plant power is OFF. Turn on plant power first.");
        }

        HmiEquipmentState state = equipmentStateRepository.findByPlantIdAndEquipmentId(plantId, equipment.getId())
                .orElseGet(() -> createDefaultState(plantId, equipment));

        switch (request.getAction().toUpperCase()) {
            case "POWER_ON" -> {
                state.setPowered(true);
                state.setMode(HmiControlMode.MANUAL);
            }
            case "POWER_OFF" -> {
                state.setPowered(false);
                state.setRunning(false);
                state.setMode(HmiControlMode.OFF);
            }
            case "START" -> {
                if (!state.isPowered()) {
                    throw new BadRequestException("Equipment must be powered before start");
                }
                state.setRunning(true);
                state.setMode(HmiControlMode.MANUAL);
            }
            case "STOP" -> {
                state.setRunning(false);
                if (state.isPowered()) {
                    state.setMode(HmiControlMode.MANUAL);
                }
            }
            default -> throw new BadRequestException("Unknown action: " + request.getAction());
        }
        state.setLastChangedBy(principal.getId());
        equipmentStateRepository.save(state);
        return getState(plantId, principal);
    }

    @Transactional
    public HmiStateResponse applyMaster(Long plantId, HmiMasterRequest request, UserPrincipal principal) {
        assertCanControl(principal);
        plantAccessService.assertCanAccessPlant(principal, plantId);
        ensureEquipmentSeeded(plantId);

        HmiPlantState plantState = getOrCreatePlantState(plantId);
        List<HmiEquipment> equipment = equipmentRepository.findByPlantIdOrderBySequenceOrderAsc(plantId);

        switch (request.getAction().toUpperCase()) {
            case "PLANT_POWER_ON" -> {
                plantState.setPlantPowered(true);
                plantState.setAutoSequenceActive(false);
                plantState.setAutoSequenceStep(0);
                for (HmiEquipment eq : equipment) {
                    HmiEquipmentState st = getOrInitState(plantId, eq);
                    if (eq.isControllable()) {
                        st.setPowered(true);
                        st.setRunning(false);
                        st.setMode(HmiControlMode.MANUAL);
                    }
                    st.setLastChangedBy(principal.getId());
                    equipmentStateRepository.save(st);
                }
            }
            case "PLANT_POWER_OFF" -> {
                plantState.setPlantPowered(false);
                plantState.setAutoSequenceActive(false);
                plantState.setAutoSequenceStep(0);
                for (HmiEquipment eq : equipment) {
                    HmiEquipmentState st = getOrInitState(plantId, eq);
                    st.setPowered(false);
                    st.setRunning(false);
                    st.setMode(HmiControlMode.OFF);
                    st.setLastChangedBy(principal.getId());
                    equipmentStateRepository.save(st);
                }
            }
            case "AUTO_SEQUENCE_START" -> {
                if (!plantState.isPlantPowered()) {
                    plantState.setPlantPowered(true);
                }
                plantState.setAutoSequenceActive(true);
                plantState.setAutoSequenceStep(0);
                for (HmiEquipment eq : equipment) {
                    HmiEquipmentState st = getOrInitState(plantId, eq);
                    st.setPowered(eq.isControllable());
                    st.setRunning(false);
                    st.setMode(eq.isControllable() ? HmiControlMode.AUTO : HmiControlMode.OFF);
                    equipmentStateRepository.save(st);
                }
                advanceAutoSequence(plantId, plantState);
            }
            case "AUTO_SEQUENCE_STOP" -> {
                plantState.setAutoSequenceActive(false);
                plantState.setAutoSequenceStep(0);
            }
            default -> throw new BadRequestException("Unknown master action: " + request.getAction());
        }
        plantState.setLastChangedBy(principal.getId());
        plantStateRepository.save(plantState);
        return getState(plantId, principal);
    }

    @Scheduled(fixedDelay = 3000)
    @Transactional
    public void tickAutoSequence() {
        plantStateRepository.findAll().stream()
                .filter(HmiPlantState::isAutoSequenceActive)
                .filter(HmiPlantState::isPlantPowered)
                .forEach(ps -> advanceAutoSequence(ps.getPlantId(), ps));
    }

    private void advanceAutoSequence(Long plantId, HmiPlantState plantState) {
        List<HmiEquipment> controllable = equipmentRepository.findByPlantIdOrderBySequenceOrderAsc(plantId).stream()
                .filter(HmiEquipment::isControllable)
                .toList();
        if (controllable.isEmpty()) {
            return;
        }

        int step = plantState.getAutoSequenceStep() != null ? plantState.getAutoSequenceStep() : 0;
        if (step >= controllable.size()) {
            plantState.setAutoSequenceActive(false);
            plantStateRepository.save(plantState);
            return;
        }

        LocalDateTime lastUpdate = plantState.getUpdatedAt();
        if (lastUpdate != null && lastUpdate.isAfter(LocalDateTime.now().minusSeconds(2))) {
            return;
        }

        for (int i = 0; i <= step; i++) {
            HmiEquipment eq = controllable.get(i);
            HmiEquipmentState st = getOrInitState(plantId, eq);
            st.setPowered(true);
            st.setRunning(true);
            st.setMode(HmiControlMode.AUTO);
            equipmentStateRepository.save(st);
        }

        plantState.setAutoSequenceStep(step + 1);
        plantStateRepository.save(plantState);
    }

    private HmiEquipmentState getOrInitState(Long plantId, HmiEquipment eq) {
        return equipmentStateRepository.findByPlantIdAndEquipmentId(plantId, eq.getId())
                .orElseGet(() -> createDefaultState(plantId, eq));
    }

    private HmiEquipmentState createDefaultState(Long plantId, HmiEquipment eq) {
        HmiEquipmentState state = HmiEquipmentState.builder()
                .plantId(plantId)
                .equipment(eq)
                .powered(false)
                .running(false)
                .mode(HmiControlMode.OFF)
                .build();
        return equipmentStateRepository.save(state);
    }

    private HmiPlantState getOrCreatePlantState(Long plantId) {
        return plantStateRepository.findById(plantId)
                .orElseGet(() -> plantStateRepository.save(HmiPlantState.builder()
                        .plantId(plantId)
                        .plantPowered(false)
                        .autoSequenceActive(false)
                        .autoSequenceStep(0)
                        .build()));
    }

    private void assertCanControl(UserPrincipal principal) {
        if (!plantAccessService.isSuperAdmin(principal) && !plantAccessService.isPlantAdmin(principal)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "Only Plant Admin or Super Admin can send HMI commands");
        }
    }

    private void ensureEquipmentSeeded(Long plantId) {
        if (!hmiPlantSetupService.seedIfNeeded(plantId)) {
            throw new BadRequestException(
                    "HMI is not configured for this plant. Use a P&ID plant such as Tata Steel West Bokaro.");
        }
    }

    private static String sensorUnit(SensorType type) {
        return switch (type) {
            case PH -> "pH";
            case TEMPERATURE, TEMPERATURE_TRANSMITTER -> "°C";
            case PRESSURE, PRESSURE_TRANSMITTER -> "bar";
            case GAS_FLOW, FLOW_TRANSMITTER -> "m³/h";
            case METHANE, CARBON_DIOXIDE, HYDROGEN_SULFIDE, AMMONIA -> "ppm";
            case HUMIDITY -> "%RH";
            case LIQUID_LEVEL -> "%";
            default -> "";
        };
    }
}
