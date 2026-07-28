/**
 * Tata Steel West Bokaro HMI — SWM-TSL-WBK-RSIP-001 Rev.1 / P&ID BPG-10-PR-GD-002 Rev.3
 */

/** HMI pages per reduced-scope plan section 11. */
export const HMI_PAGES = [
  {
    id: 'OVERVIEW',
    label: 'Plant Overview',
    zones: null,
    tags: null,
    description: 'Process flow, equipment run/fault status, safety chain and active alarms',
  },
  {
    id: 'FEED',
    label: 'Feed & Pretreatment',
    zones: ['FEED_PREP', 'PRETREATMENT'],
    tags: ['T101', 'BC101', 'CH101', 'T102', 'AG101'],
    description: 'T101, BC101, CH101, T102, AG101 — levels and permissives',
  },
  {
    id: 'DIGESTER',
    label: 'Digester & Feed Pumps',
    zones: ['FEED_TO_DIGESTER', 'DIGESTION'],
    tags: ['P-101A', 'P-101B', 'T104', 'AG102'],
    description: 'P101 A/B duty-standby, AG102, digester pressure and feed flow',
  },
  {
    id: 'GAS',
    label: 'Gas System',
    zones: ['GAS_HANDLING'],
    tags: ['B101', 'SC101', 'GE101', 'FA101'],
    description: 'Balloon pressure/flow, scrubber, genset and flare status',
  },
  {
    id: 'SLURRY',
    label: 'Slurry & ETP',
    zones: ['EFFLUENT'],
    tags: ['T105', 'P102', 'FP101', 'T106', 'P103', 'T108', 'P104'],
    description: 'T105/T106/T108 levels, pumps and FP101 status',
  },
];

export const HMI_ZONES = [
  { id: 'ALL', label: 'All Zones' },
  { id: 'FEED_PREP', label: 'Feed Prep' },
  { id: 'PRETREATMENT', label: 'Pretreatment' },
  { id: 'FEED_TO_DIGESTER', label: 'Feed to Digester' },
  { id: 'DIGESTION', label: 'Digestion' },
  { id: 'GAS_HANDLING', label: 'Gas Handling' },
  { id: 'EFFLUENT', label: 'Slurry / ETP' },
];

export const ZONE_COLORS = {
  FEED_PREP: '#4fc3f7',
  PRETREATMENT: '#81c784',
  FEED_TO_DIGESTER: '#ffb74d',
  DIGESTION: '#9575cd',
  GAS_HANDLING: '#ff8a65',
  EFFLUENT: '#90a4ae',
};

/** Process sequence per PDF section 6 equipment order. */
export const PROCESS_FLOW_STEPS = [
  'T101 Hopper — feed intake and bag breaking',
  'BC101 Belt conveyor — transfer to crusher',
  'CH101 Crusher — size reduction (5 HP)',
  'T102 Pre-treatment tank — conditioning slurry',
  'AG101 Pre-treatment mixer — agitation',
  'P-101A/B Feed pumps — duty/standby to digester',
  'T104 Main digester — biogas production (70 CUM)',
  'AG102 Digester scum breaker',
  'B101 Gas balloon — storage and pressure monitoring',
  'SC101 Scrubber — gas treatment package',
  'GE101 Biogas generator — 15 kVA power output',
  'FA101 Flare — excess gas disposal',
  'T105/P102 Slurry tank and transfer pump',
  'FP101 Filter press — solid/liquid separation',
  'T106/P103 Equalization tank and pump',
  'T108/P104 Treated water tank and reuse pump',
];

/** Motor / electric equipment status colors (P&ID overlay). */
export const MOTOR_STATUS = [
  { id: 'RUNNING', label: 'Running (on & working)', color: '#4caf50', border: '#2e7d32', glow: true },
  { id: 'FAULT', label: 'On but fault', color: '#ffc107', border: '#f9a825', glow: true },
  { id: 'OFF', label: 'Off', color: '#f44336', border: '#c62828', glow: false },
];

export function equipmentMotorStatus(eq) {
  if (!eq) return 'OFF';
  const on = eq.powered || eq.running;
  if (on && eq.inAlarm) return 'FAULT';
  if (eq.running && !eq.inAlarm) return 'RUNNING';
  return 'OFF';
}

export function equipmentStatusColor(eq) {
  const status = equipmentMotorStatus(eq);
  const found = MOTOR_STATUS.find((s) => s.id === status);
  return found?.color ?? MOTOR_STATUS[2].color;
}

export function equipmentStatusBorder(eq) {
  const status = equipmentMotorStatus(eq);
  const found = MOTOR_STATUS.find((s) => s.id === status);
  return found?.border ?? MOTOR_STATUS[2].border;
}

export function isTankKind(kind) {
  return ['TANK', 'DIGESTER', 'BALLOON', 'ETP'].includes(kind);
}

export function filterEquipmentForPage(equipment, pageId) {
  const page = HMI_PAGES.find((p) => p.id === pageId);
  if (!page || pageId === 'OVERVIEW') return equipment || [];
  if (page.tags) {
    return (equipment || []).filter((eq) => page.tags.includes(eq.tagNo));
  }
  if (page.zones) {
    return (equipment || []).filter((eq) => page.zones.includes(eq.zone));
  }
  return equipment || [];
}

export function filterHotspotsForPage(hotspots, pageId) {
  const page = HMI_PAGES.find((p) => p.id === pageId);
  if (!page || pageId === 'OVERVIEW') return hotspots || [];
  if (page.tags) {
    return (hotspots || []).filter((h) => page.tags.includes(h.tagNo));
  }
  return hotspots || [];
}

export function getPageZones(pageId) {
  const page = HMI_PAGES.find((p) => p.id === pageId);
  if (!page || pageId === 'OVERVIEW') return null;
  return page.zones;
}
