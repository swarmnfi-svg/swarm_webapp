/**
 * SWARM platform & HMI — SWM-TSL-WBK-RSIP-001 Rev.1 / P&ID BPG-10-PR-GD-002 Rev.3
 * HMI pages per reduced-scope plan section 11.
 */

export const SWARM_PLATFORM = {
  name: 'SWARM',
  tagline: 'Industrial IoT control, reporting & AI platform expilization',
  subtitle: 'Tata Steel West Bokaro — 600 kg/day biomethanation',
  document: 'SWM-TSL-WBK-RSIP-001 Rev.1',
  pid: 'Biogas Plant PFD — block diagram HMI',
  hmiNote: 'swarm-hmi displays state — control logic runs in swarm-control on SWARM Core',
  modules: [
    { id: 'swarm-io', label: 'swarm-io', desc: 'I/O scan, channel quality, safe-state' },
    { id: 'swarm-control', label: 'swarm-control', desc: 'State machines, permissives, interlocks' },
    { id: 'swarm-alarm', label: 'swarm-alarm', desc: 'Priority, latch, acknowledgement' },
    { id: 'swarm-hmi', label: 'swarm-hmi', desc: 'Local web HMI (this screen)' },
    { id: 'swarm-historian', label: 'swarm-historian', desc: 'Time-series historian' },
    { id: 'swarm-connect', label: 'swarm-connect', desc: 'Read-only cloud / emPOWER sync' },
    { id: 'swarm-update', label: 'swarm-update', desc: 'Signed updates & rollback' },
  ],
};

/** PDF section 11 — HMI page definitions */
export const HMI_PAGES = [
  {
    id: 'OVERVIEW',
    label: 'Plant Overview',
    description: 'Process flow, run/fault status, safety chain and active alarms',
    controlPage: true,
  },
  {
    id: 'FEED',
    label: 'Feed & Pretreatment',
    description: 'T101, BC101, CH101, T102, AG101 — levels and permissives',
    tags: ['T101', 'BC101', 'CH101', 'T102', 'AG101'],
    zoneId: 'FEED',
    controlPage: true,
  },
  {
    id: 'DIGESTER',
    label: 'Digester & Feed Pumps',
    description: 'P101 A/B duty/standby, AG102, digester pressure, feed flow and alarms',
    tags: ['P-101A', 'P-101B', 'T104', 'AG102'],
    zoneId: 'DIGESTER',
    controlPage: true,
  },
  {
    id: 'GAS',
    label: 'Gas System',
    description: 'Balloon pressure/flow, scrubber, genset and flare status',
    tags: ['B101', 'SC101', 'GE101', 'FA101'],
    zoneId: 'GAS',
    controlPage: true,
  },
  {
    id: 'SLURRY',
    label: 'Slurry & ETP',
    description: 'T105/T106/T108 levels, pumps and FP101 status',
    tags: ['T105', 'P102', 'FP101', 'T106', 'P103', 'T108', 'P104'],
    zoneId: 'EFFLUENT',
    controlPage: true,
  },
  {
    id: 'ALARMS',
    label: 'Alarm Summary',
    description: 'Priority, timestamp, acknowledgement, trip cause and reset status',
  },
  {
    id: 'TRENDS',
    label: 'Trends & Totals',
    description: 'Pressure, flow and temperature; daily water/feed/gas totals',
  },
  {
    id: 'DIAGNOSTICS',
    label: 'Maintenance / Diagnostics',
    description: 'I/O quality, communication status, runtime and device fault status',
  },
  {
    id: 'AUDIT',
    label: 'User & Audit',
    description: 'Operator, supervisor and engineer roles; command audit log',
  },
];

export const SWARM_ZONES = [
  {
    id: 'FEED',
    label: 'Feed & Pretreatment Circuit',
    zones: ['FEED_PREP', 'PRETREATMENT'],
    color: '#0288d1',
  },
  {
    id: 'DIGESTER',
    label: 'Digester & Feed Pump Circuit',
    zones: ['FEED_TO_DIGESTER', 'DIGESTION'],
    color: '#7b1fa2',
  },
  {
    id: 'GAS',
    label: 'Gas Utilisation Circuit',
    zones: ['GAS_HANDLING'],
    color: '#e64a19',
  },
  {
    id: 'EFFLUENT',
    label: 'Slurry & ETP Circuit',
    zones: ['EFFLUENT'],
    color: '#546e7a',
  },
];

export const MOTOR_STATUS = [
  { id: 'RUNNING', label: 'Running', color: '#4caf50', border: '#2e7d32' },
  { id: 'FAULT', label: 'Fault', color: '#ffc107', border: '#f9a825' },
  { id: 'OFF', label: 'Off', color: '#f44336', border: '#c62828' },
];

export const SAFETY_LEVELS = [
  { level: 1, label: 'Equipment trip', status: 'ok' },
  { level: 2, label: 'Sectional shutdown', status: 'ok' },
  { level: 3, label: 'Plant ESD', status: 'ok' },
  { level: 4, label: 'Emergency response', status: 'ok' },
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
  return MOTOR_STATUS.find((s) => s.id === status)?.color ?? MOTOR_STATUS[2].color;
}

export function equipmentStatusBorder(eq) {
  const status = equipmentMotorStatus(eq);
  return MOTOR_STATUS.find((s) => s.id === status)?.border ?? MOTOR_STATUS[2].border;
}

export function getZoneForEquipment(eq) {
  return SWARM_ZONES.find((z) => z.zones.includes(eq.zone))?.id ?? 'FEED';
}

export function getMotorsByZone(equipment, pageId = null) {
  const page = pageId ? HMI_PAGES.find((p) => p.id === pageId) : null;
  let motors = (equipment || []).filter((eq) => eq.controllable);
  if (page?.tags) {
    motors = motors.filter((eq) => page.tags.includes(eq.tagNo));
  }
  const grouped = {};
  SWARM_ZONES.forEach((z) => { grouped[z.id] = []; });
  motors.forEach((eq) => {
    const zid = getZoneForEquipment(eq);
    if (grouped[zid]) grouped[zid].push(eq);
  });
  return grouped;
}

export function getMonitorsForPage(equipment, pageId) {
  const page = HMI_PAGES.find((p) => p.id === pageId);
  if (!page) return [];
  if (page.zoneId) {
    const zone = SWARM_ZONES.find((z) => z.id === page.zoneId);
    if (zone?.zones) {
      return (equipment || []).filter(
        (eq) => !eq.controllable && zone.zones.includes(eq.zone),
      );
    }
  }
  if (!page.tags) return [];
  return (equipment || []).filter(
    (eq) => page.tags.includes(eq.tagNo) && !eq.controllable,
  );
}

export function filterEquipmentForPage(equipment, pageId) {
  const page = HMI_PAGES.find((p) => p.id === pageId);
  if (!page?.tags) return equipment || [];
  return (equipment || []).filter((eq) => page.tags.includes(eq.tagNo));
}

export const PROCESS_FLOW_STEPS = [
  'T101 Hopper / bag breaker — feed intake',
  'BC101 Belt conveyor — transfer to crusher',
  'CH101 Crusher — size reduction',
  'T102 + AG101 Pre-treatment tank and mixer',
  'P-101A/B Digester feed pumps — duty/standby',
  'T104 Main digester — biogas production',
  'AG102 Digester scum breaker',
  'B101 Gas balloon — storage & pressure',
  'SC101 Scrubber package',
  'GE101 Biogas generator 15 kVA',
  'FA101 Flare package',
  'T105/P102 Slurry tank and pump',
  'FP101 Filter press',
  'T106/P103 Equalization tank and pump',
  'T108/P104 Treated water tank and pump',
];

export function appendAuditLog(plantId, entry) {
  const key = `swarm_audit_${plantId}`;
  try {
    const list = JSON.parse(sessionStorage.getItem(key) || '[]');
    list.unshift({ ...entry, at: new Date().toISOString() });
    sessionStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch { /* ignore */ }
}

export function loadAuditLog(plantId) {
  try {
    return JSON.parse(sessionStorage.getItem(`swarm_audit_${plantId}`) || '[]');
  } catch {
    return [];
  }
}
