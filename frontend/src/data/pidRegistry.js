/** ISA symbol and grouping for P&ID instruments */

const INSTRUMENT_KINDS = new Set([
  'LEVEL_TRANSMITTER', 'LEVEL_SWITCH', 'FLOW_TRANSMITTER', 'PRESSURE_TRANSMITTER',
  'TEMPERATURE_TRANSMITTER', 'ANALYZER', 'PRESSURE_SAFETY_VALVE', 'DIFF_PRESSURE_TRANSMITTER',
]);

export function isInstrument(eq) {
  return INSTRUMENT_KINDS.has(eq?.equipmentKind);
}

export function isMotorOrValve(eq) {
  return eq?.controllable && !INSTRUMENT_KINDS.has(eq?.equipmentKind);
}

export function isaSymbol(eq) {
  if (!eq) return '?';
  const tag = eq.tagNo || '';
  if (tag.startsWith('TIT') || tag.startsWith('TT')) return 'TT';
  if (tag.startsWith('FIT')) return 'FIT';
  if (tag.startsWith('PIT') || tag.startsWith('PI-')) return 'PIT';
  if (tag.startsWith('PDT')) return 'PDT';
  if (tag.startsWith('LIT') || tag.startsWith('LT')) return 'LIT';
  if (tag.startsWith('LS')) return 'LS';
  if (tag.startsWith('AIT')) return 'AIT';
  if (tag.startsWith('PSV')) return 'PSV';
  if (tag.startsWith('SV')) return 'SV';
  const map = {
    LEVEL_TRANSMITTER: 'LIT',
    LEVEL_SWITCH: 'LS',
    FLOW_TRANSMITTER: 'FIT',
    PRESSURE_TRANSMITTER: 'PIT',
    TEMPERATURE_TRANSMITTER: 'TT',
    ANALYZER: 'AIT',
    PRESSURE_SAFETY_VALVE: 'PSV',
    DIFF_PRESSURE_TRANSMITTER: 'PDT',
    SOLENOID_VALVE: 'SV',
  };
  return map[eq.equipmentKind] || eq.equipmentKind?.slice(0, 3) || '?';
}

export const INSTRUMENT_GROUPS = [
  { id: 'TT', label: 'Temperature (TT)', kinds: ['TEMPERATURE_TRANSMITTER'], prefix: ['TIT', 'TT'] },
  { id: 'FIT', label: 'Flow (FIT)', kinds: ['FLOW_TRANSMITTER'], prefix: ['FIT'] },
  { id: 'PIT', label: 'Pressure (PIT/PDT)', kinds: ['PRESSURE_TRANSMITTER', 'DIFF_PRESSURE_TRANSMITTER'], prefix: ['PIT', 'PDT', 'PI'] },
  { id: 'LIT', label: 'Level (LIT/LS)', kinds: ['LEVEL_TRANSMITTER', 'LEVEL_SWITCH'], prefix: ['LIT', 'LT', 'LS'] },
  { id: 'AIT', label: 'Analyzers (AIT)', kinds: ['ANALYZER'], prefix: ['AIT'] },
  { id: 'PSV', label: 'Safety (PSV)', kinds: ['PRESSURE_SAFETY_VALVE'], prefix: ['PSV'] },
];

export function groupInstruments(equipment) {
  const instruments = (equipment || []).filter(isInstrument);
  const groups = {};
  INSTRUMENT_GROUPS.forEach((g) => { groups[g.id] = []; });
  instruments.forEach((eq) => {
    const sym = isaSymbol(eq);
    const group = INSTRUMENT_GROUPS.find((g) => g.id === sym || g.prefix.some((p) => eq.tagNo?.startsWith(p)));
    const key = group?.id || 'OTHER';
    if (!groups[key]) groups[key] = [];
    groups[key].push(eq);
  });
  return groups;
}

export function filterInstrumentsByZone(equipment, zoneIds) {
  if (!zoneIds?.length) return (equipment || []).filter(isInstrument);
  return (equipment || []).filter((eq) => isInstrument(eq) && zoneIds.includes(eq.zone));
}

export function filterEquipmentByZones(equipment, zoneIds) {
  if (!zoneIds?.length) return equipment || [];
  return (equipment || []).filter((eq) => zoneIds.includes(eq.zone));
}

export function filterHotspotsForTags(hotspots, tagNos) {
  const tags = new Set(tagNos);
  return (hotspots || []).filter((h) => tags.has(h.tagNo));
}

export function equipmentTagsForZones(equipment, zoneIds) {
  return filterEquipmentByZones(equipment, zoneIds).map((eq) => eq.tagNo);
}
