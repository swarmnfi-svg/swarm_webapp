package com.biopower.service;

import com.biopower.model.entity.HmiEquipment;
import com.biopower.model.entity.HmiEquipmentState;
import com.biopower.model.entity.HmiPlantState;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.enums.HmiControlMode;
import com.biopower.model.enums.HmiEquipmentKind;
import com.biopower.model.enums.HmiZone;
import com.biopower.repository.HmiEquipmentRepository;
import com.biopower.repository.HmiEquipmentStateRepository;
import com.biopower.repository.HmiPlantStateRepository;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorNodeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Seeds HMI registry aligned to the interactive block-diagram PFD (1600×950 viewBox).
 * Drawing tags (H-101, D-101, …) are shown in equipment names; RSIP tags are tagNo.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class HmiPlantSetupService {

  private static final String SEED_MARKER = "HTML-PFD-V2";

  private final PlantRepository plantRepository;
  private final SensorNodeRepository sensorNodeRepository;
  private final HmiEquipmentRepository equipmentRepository;
  private final HmiEquipmentStateRepository equipmentStateRepository;
  private final HmiPlantStateRepository plantStateRepository;

  private final ConcurrentHashMap<Long, Object> plantSeedLocks = new ConcurrentHashMap<>();

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public boolean seedIfNeeded(Long plantId) {
    synchronized (plantSeedLocks.computeIfAbsent(plantId, id -> new Object())) {
      return seedIfNeededInternal(plantId);
    }
  }

  private boolean seedIfNeededInternal(Long plantId) {
    if (!plantRepository.findById(plantId).filter(this::supportsHmi).isPresent()) {
      return false;
    }
    if (equipmentRepository.existsByPlantId(plantId) && isCurrentSeed(plantId)) {
      return true;
    }
    if (equipmentRepository.existsByPlantId(plantId)) {
      log.info("HMI registry outdated for plant {} — reseeding with P&ID instruments", plantId);
      clearPlantEquipment(plantId);
    }
    plantRepository.findById(plantId).ifPresent(this::seedForPlant);
    return equipmentRepository.existsByPlantId(plantId);
  }

  private boolean isCurrentSeed(Long plantId) {
    return equipmentRepository.findByPlantIdAndTagNo(plantId, SEED_MARKER).isPresent();
  }

  public boolean supportsHmi(Plant plant) {
    if (plant.getFeedstockType() != null && plant.getFeedstockType().toUpperCase().contains("P&ID")) {
      return true;
    }
    String name = plant.getPlantName() != null ? plant.getPlantName().toLowerCase() : "";
    return name.contains("biomethanation") || name.contains("tata steel");
  }

  private void seedForPlant(Plant plant) {
    Long plantId = plant.getPlantId();
    log.info("Seeding HMI + P&ID instruments for plant: {}", plant.getPlantName());

    Map<String, SensorNode> nodesByKeyword = sensorNodeRepository.findByPlantPlantId(plantId).stream()
        .collect(Collectors.toMap(
            n -> n.getNodeName().toLowerCase(),
            Function.identity(),
            (a, b) -> a));

    List<EquipmentSeed> seeds = new ArrayList<>();
    // Hotspot x/y/w/h are % on the 1600×950 PFD viewBox (biogas-pfd.html)
    seeds.add(seed("T101", "Hopper / Bag Breaker (H-101)", HmiZone.FEED_PREP, HmiEquipmentKind.HOPPER, true, 1, 1.0, "1 CUM", 6.25, 24.21, 8.125, 5.26, null));
    seeds.add(seed("BC101", "Belt Conveyor (BC-101)", HmiZone.FEED_PREP, HmiEquipmentKind.CONVEYOR, true, 2, 2.0, "200 KG/HR", 6.25, 35.79, 11.25, 4.21, null));
    seeds.add(seed("CH101", "Crusher (CR-101)", HmiZone.FEED_PREP, HmiEquipmentKind.CRUSHER, true, 3, 5.0, "600 KG/HR", 19.375, 35.79, 6.875, 7.37, null));
    seeds.add(seed("SH102", "Solar Water Heater (SH-102)", HmiZone.PRETREATMENT, HmiEquipmentKind.HEATER, false, 4, null, "600 LPD", 29.375, 10.53, 8.75, 6.32, null));
    seeds.add(seed("T102", "Pre-Treatment Tank (T-101)", HmiZone.PRETREATMENT, HmiEquipmentKind.TANK, false, 5, null, "10 CUM", 35.125, 40, 15.31, 13.68, null));
    seeds.add(seed("AG101", "Pre-Treatment Mixer (M-101)", HmiZone.PRETREATMENT, HmiEquipmentKind.AGITATOR, true, 6, 3.0, "3 HP", 35.125, 31.58, 2.5, 4.21, null));
    seeds.add(seed("P-101A", "Digester Feed Pump A / PS (P-101A)", HmiZone.FEED_TO_DIGESTER, HmiEquipmentKind.PUMP, true, 7, 2.0, "10 CUM/HR", 29.19, 44.95, 2.25, 2.95, null));
    seeds.add(seed("P-101B", "Digester Feed Pump B / PW (P-101B)", HmiZone.FEED_TO_DIGESTER, HmiEquipmentKind.PUMP, true, 8, 2.0, "10 CUM/HR", 41.125, 44.95, 2.25, 2.95, null));
    seeds.add(seed("T104", "Main Digester (D-101)", HmiZone.DIGESTION, HmiEquipmentKind.DIGESTER, false, 9, null, "110 CUM", 56.25, 17.37, 12.5, 10.53, nodeByPrefix(nodesByKeyword, "lit-103")));
    seeds.add(seed("AG102", "Digester Mixer (M-102)", HmiZone.DIGESTION, HmiEquipmentKind.AGITATOR, true, 10, 2.0, "2 HP", 56.25, 5.26, 1.875, 3.16, null));
    seeds.add(seed("T105", "Slurry Storage Tank (T-103)", HmiZone.EFFLUENT, HmiEquipmentKind.TANK, false, 11, null, "10 CUM", 64.375, 38.95, 12.5, 9.47, nodeByPrefix(nodesByKeyword, "lit-201")));
    seeds.add(seed("P102", "Slurry Pump (P-102)", HmiZone.EFFLUENT, HmiEquipmentKind.PUMP, true, 12, 1.0, "2 CUM/HR", 68.875, 42.11, 2.25, 2.95, null));
    seeds.add(seed("FP101", "Screw Press (SP-101)", HmiZone.EFFLUENT, HmiEquipmentKind.FILTER_PRESS, true, 13, 3.0, "1 CUM/HR", 77.81, 29.47, 5, 9.47, null));
    seeds.add(seed("T106", "Equalization Tank (T-106)", HmiZone.EFFLUENT, HmiEquipmentKind.TANK, false, 14, null, "10 CUM", 87.81, 43.16, 11.25, 9.47, nodeByPrefix(nodesByKeyword, "lit-201")));
    seeds.add(seed("P103", "Equalization Pump (P-103)", HmiZone.EFFLUENT, HmiEquipmentKind.PUMP, true, 15, 2.0, "5 CUM/HR", 84.5, 44.95, 2.25, 2.95, null));
    seeds.add(seed("T108", "Treated Water Tank (T-104)", HmiZone.EFFLUENT, HmiEquipmentKind.TANK, false, 16, null, "10 CUM", 49.375, 42.11, 10, 10.53, null));
    seeds.add(seed("P104", "Treated Water Pump (P-104)", HmiZone.EFFLUENT, HmiEquipmentKind.PUMP, true, 17, 2.0, "5 CUM/HR", 47, 44.95, 2.25, 2.95, null));
    seeds.add(seed("MT101", "Moisture Trap (MT-101)", HmiZone.GAS_HANDLING, HmiEquipmentKind.MOISTURE_TRAP, false, 18, null, null, 43.75, 63.16, 5, 8.42, null));
    seeds.add(seed("B101", "Gas Balloon (B-101)", HmiZone.GAS_HANDLING, HmiEquipmentKind.BALLOON, false, 19, null, "60 CUM", 51.25, 75.79, 14.38, 12.63, nodeByPrefix(nodesByKeyword, "lit-301")));
    seeds.add(seed("SC101", "Scrubber Package (S-101)", HmiZone.GAS_HANDLING, HmiEquipmentKind.SCRUBBER, true, 20, null, "15 NM3/HR", 30.625, 75.79, 5.625, 7.37, nodeByPrefix(nodesByKeyword, "pdt-201")));
    seeds.add(seed("GE101", "Biogas Generator (GE-101)", HmiZone.GAS_HANDLING, HmiEquipmentKind.GENERATOR, true, 21, null, "15 KVA", 17, 75.79, 6.56, 12.63, nodeByPrefix(nodesByKeyword, "fit-301")));
    seeds.add(seed("FA101", "Flare (FL-101)", HmiZone.GAS_HANDLING, HmiEquipmentKind.FLARE, true, 22, null, "15 NM3/HR", 88.75, 89.47, 5, 14.74, null));

    seeds.add(seed("SV-01", "Solenoid Valve SV-01 (solar water)", HmiZone.PRETREATMENT, HmiEquipmentKind.SOLENOID_VALVE, true, 30, null, null, 26.875, 10.53, 2.5, 2.5, null));
    seeds.add(seed("SV-02", "Solenoid Valve SV-02 (fresh water)", HmiZone.PRETREATMENT, HmiEquipmentKind.SOLENOID_VALVE, true, 31, null, null, 6.875, 10.53, 2.5, 2.5, null));
    seeds.add(seed("SV-04", "Solenoid Valve SV-04 (gas to genset)", HmiZone.GAS_HANDLING, HmiEquipmentKind.SOLENOID_VALVE, true, 32, null, null, 20.31, 75.79, 2.5, 2.5, null));

    seeds.add(inst("FIT-101", "FIT Raw Water Inlet", HmiZone.FEED_PREP, HmiEquipmentKind.FLOW_TRANSMITTER, 11.875, 10.53, 2.5, 2.5, node(nodesByKeyword, "fit-101"), 50));
    seeds.add(inst("LS-101H", "LS T-102 High Level", HmiZone.PRETREATMENT, HmiEquipmentKind.LEVEL_SWITCH, 35.125, 34.74, 2, 2, null, 51));
    seeds.add(inst("LS-101L", "LS T-102 Low Level", HmiZone.PRETREATMENT, HmiEquipmentKind.LEVEL_SWITCH, 35.125, 44.21, 2, 2, null, 52));
    seeds.add(inst("LIT-101", "LIT T-102 Level", HmiZone.PRETREATMENT, HmiEquipmentKind.LEVEL_TRANSMITTER, 33.75, 40, 2.5, 2.5, node(nodesByKeyword, "lit-101"), 53));
    seeds.add(inst("TIT-101", "TT T-102 Temperature", HmiZone.PRETREATMENT, HmiEquipmentKind.TEMPERATURE_TRANSMITTER, 36.56, 37.89, 2.5, 2.5, node(nodesByKeyword, "tit-101"), 54));
    seeds.add(inst("FIT-102", "FIT Slurry Feed to D-101", HmiZone.FEED_TO_DIGESTER, HmiEquipmentKind.FLOW_TRANSMITTER, 46.875, 17.37, 2.5, 2.5, node(nodesByKeyword, "fit-102"), 55));
    seeds.add(inst("LIT-103", "LIT D-101 Slurry Level", HmiZone.DIGESTION, HmiEquipmentKind.LEVEL_TRANSMITTER, 56.25, 20.53, 2.5, 2.5, node(nodesByKeyword, "lit-103"), 60));
    seeds.add(inst("PIT-103", "PIT D-101 Gas Space", HmiZone.DIGESTION, HmiEquipmentKind.PRESSURE_TRANSMITTER, 53.125, 4.74, 2.5, 2.5, node(nodesByKeyword, "pit-103"), 61));
    seeds.add(inst("TIT-103A", "TT D-101 Temperature A", HmiZone.DIGESTION, HmiEquipmentKind.TEMPERATURE_TRANSMITTER, 55, 18.42, 2.5, 2.5, node(nodesByKeyword, "tit-103a"), 62));
    seeds.add(inst("TIT-103B", "TT D-101 Temperature B", HmiZone.DIGESTION, HmiEquipmentKind.TEMPERATURE_TRANSMITTER, 57.5, 19.47, 2.5, 2.5, node(nodesByKeyword, "tit-103b"), 63));
    seeds.add(inst("AIT-103", "AIT D-101 Slurry pH", HmiZone.DIGESTION, HmiEquipmentKind.ANALYZER, 56.25, 21.05, 2.5, 2.5, node(nodesByKeyword, "ait-103"), 64));
    seeds.add(inst("PSV-103", "PSV D-101 Relief", HmiZone.DIGESTION, HmiEquipmentKind.PRESSURE_SAFETY_VALVE, 56.25, 10.53, 2.5, 2.5, null, 65));
    seeds.add(inst("LIT-201", "LIT T-105 Slurry Storage", HmiZone.EFFLUENT, HmiEquipmentKind.LEVEL_TRANSMITTER, 64.375, 36.84, 2.5, 2.5, node(nodesByKeyword, "lit-201"), 70));
    seeds.add(inst("FIT-201", "FIT Slurry Flow after P-102", HmiZone.EFFLUENT, HmiEquipmentKind.FLOW_TRANSMITTER, 71.875, 31.58, 2.5, 2.5, node(nodesByKeyword, "fit-201"), 71));
    seeds.add(inst("PIT-202", "PIT Gas Header", HmiZone.GAS_HANDLING, HmiEquipmentKind.PRESSURE_TRANSMITTER, 38.125, 75.79, 2.5, 2.5, node(nodesByKeyword, "pit-202"), 72));
    seeds.add(inst("AIT-302", "AIT Flare FA-101 Feed", HmiZone.GAS_HANDLING, HmiEquipmentKind.ANALYZER, 88.75, 84.21, 2.5, 2.5, node(nodesByKeyword, "ait-302"), 73));
    seeds.add(inst("PDT-201", "PDT Scrubber S-101 ΔP", HmiZone.GAS_HANDLING, HmiEquipmentKind.DIFF_PRESSURE_TRANSMITTER, 30.625, 71.58, 2.5, 2.5, node(nodesByKeyword, "pdt-201"), 74));
    seeds.add(inst("AIT-201", "AIT Biogas H2S", HmiZone.GAS_HANDLING, HmiEquipmentKind.ANALYZER, 34.375, 68.42, 2.5, 2.5, node(nodesByKeyword, "ait-201"), 75));
    seeds.add(inst("AIT-202", "AIT Treated Biogas CH4", HmiZone.GAS_HANDLING, HmiEquipmentKind.ANALYZER, 25, 71.58, 2.5, 2.5, node(nodesByKeyword, "ait-202"), 76));
    seeds.add(inst("FIT-202", "FIT Treated Biogas Header", HmiZone.GAS_HANDLING, HmiEquipmentKind.FLOW_TRANSMITTER, 41.25, 75.79, 2.5, 2.5, node(nodesByKeyword, "fit-202"), 77));
    seeds.add(inst("LIT-301", "LIT Gas Balloon", HmiZone.GAS_HANDLING, HmiEquipmentKind.LEVEL_TRANSMITTER, 55.625, 65.79, 2.5, 2.5, node(nodesByKeyword, "lit-301"), 78));
    seeds.add(inst("FIT-301", "FIT Biogas to GE-101", HmiZone.GAS_HANDLING, HmiEquipmentKind.FLOW_TRANSMITTER, 25, 75.79, 2.5, 2.5, node(nodesByKeyword, "fit-301"), 79));
    seeds.add(inst("HTML-PFD-V2", "PFD block diagram registry marker", HmiZone.FEED_PREP, HmiEquipmentKind.FLOW_TRANSMITTER, 0.5, 0.5, 0.1, 0.1, null, 999));

    for (EquipmentSeed s : seeds) {
      HmiEquipment eq = equipmentRepository.save(HmiEquipment.builder()
          .plantId(plantId)
          .tagNo(s.tagNo())
          .name(s.name())
          .zone(s.zone())
          .equipmentKind(s.kind())
          .controllable(s.controllable())
          .sequenceOrder(s.sequenceOrder())
          .motorHp(s.motorHp())
          .capacity(s.capacity())
          .sensorNodeId(s.sensorNodeId())
          .hotspotX(s.x())
          .hotspotY(s.y())
          .hotspotW(s.w())
          .hotspotH(s.h())
          .build());
      if (s.controllable()) {
        equipmentStateRepository.save(HmiEquipmentState.builder()
            .plantId(plantId)
            .equipment(eq)
            .powered(false)
            .running(false)
            .mode(HmiControlMode.OFF)
            .build());
      }
    }

    if (plantStateRepository.findById(plantId).isEmpty()) {
      plantStateRepository.save(HmiPlantState.builder()
          .plantId(plantId)
          .plantPowered(false)
          .autoSequenceActive(false)
          .autoSequenceStep(0)
          .build());
    }

    log.info("HMI registry seeded: {} items (equipment + instruments) for {}", seeds.size(), plant.getPlantName());
  }

  private void clearPlantEquipment(Long plantId) {
    equipmentStateRepository.deleteByPlantId(plantId);
    equipmentStateRepository.flush();
    equipmentRepository.deleteByPlantId(plantId);
    equipmentRepository.flush();
  }

  private static SensorNode nodeByPrefix(Map<String, SensorNode> nodes, String prefix) {
    String p = prefix.toLowerCase();
    return nodes.entrySet().stream()
        .filter(e -> e.getKey().startsWith(p))
        .map(Map.Entry::getValue)
        .findFirst()
        .orElse(null);
  }

  private static SensorNode node(Map<String, SensorNode> nodes, String keyword) {
    return nodeByPrefix(nodes, keyword);
  }

  private static EquipmentSeed seed(String tagNo, String name, HmiZone zone, HmiEquipmentKind kind,
                                    boolean controllable, int order, Double hp, String capacity,
                                    double x, double y, double w, double h, SensorNode node) {
    return new EquipmentSeed(tagNo, name, zone, kind, controllable, order, hp, capacity, x, y, w, h,
        node != null ? node.getNodeId() : null);
  }

  private static EquipmentSeed inst(String tagNo, String name, HmiZone zone, HmiEquipmentKind kind,
                                    double x, double y, double w, double h, SensorNode node, int order) {
    return new EquipmentSeed(tagNo, name, zone, kind, false, order, null, null, x, y, w, h,
        node != null ? node.getNodeId() : null);
  }

  private record EquipmentSeed(String tagNo, String name, HmiZone zone, HmiEquipmentKind kind,
                               boolean controllable, int sequenceOrder, Double motorHp, String capacity,
                               double x, double y, double w, double h, Long sensorNodeId) {}
}
