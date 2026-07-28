/**
 * Swarm Control — IIoT HMI Runtime
 * ISA-101 inspired visualization layer (no PLC logic)
 */
(function (global) {
    'use strict';

    // =========================================================================
    // CONSTANTS
    // =========================================================================
    const SWARM_CONSTANTS = {
        COLORS: {
            idle: '#64748b',
            remote: '#38bdf8',
            running: '#22c55e',
            warning: '#f59e0b',
            maintenance: '#eab308',
            alarm: '#ef4444',
            offline: '#1e293b',
            unknown: '#f8fafc'
        },
        EQUIPMENT_STATUS: [
            'off', 'ready', 'running', 'starting', 'stopping',
            'local', 'remote', 'manual', 'auto', 'maintenance',
            'interlocked', 'alarm', 'fault', 'emergency_stop',
            'comm_lost', 'power_available', 'power_lost'
        ],
        FLOW_STATES: ['none', 'low', 'normal', 'reverse', 'fault'],
        ALARM_LEVELS: [
            'normal', 'advisory', 'warning', 'alarm', 'critical',
            'trip', 'esd', 'maintenance', 'suppressed', 'shelved',
            'acknowledged', 'comm_lost'
        ],
        LED_TYPES: ['power', 'running', 'health', 'mode', 'comm', 'alarm'],
        POST_MESSAGE_TYPES: ['telemetry', 'alarm', 'command', 'config', 'heartbeat']
    };

    // =========================================================================
    // EVENT DISPATCHER
    // =========================================================================
    class EventBus {
        constructor() {
            this._handlers = new Map();
        }

        on(event, handler) {
            if (!this._handlers.has(event)) this._handlers.set(event, new Set());
            this._handlers.get(event).add(handler);
            return () => this._handlers.get(event).delete(handler);
        }

        emit(event, payload) {
            const handlers = this._handlers.get(event);
            if (!handlers) return;
            handlers.forEach((fn) => fn(payload));
        }
    }

    // =========================================================================
    // EQUIPMENT MODEL
    // =========================================================================
    function createEquipmentDefaults(overrides = {}) {
        return {
            id: '',
            tag: '',
            name: '',
            type: 'equipment',
            description: '',
            status: 'off',
            running: false,
            power: true,
            communication: true,
            health: 'normal',
            controlMode: 'auto',
            alarms: [],
            interlocks: [],
            maintenance: null,
            aiRecommendation: null,
            telemetry: {
                runningHours: 0,
                powerKw: 0,
                motorCurrentA: 0,
                temperatureC: null,
                lastMaintenance: null
            },
            ...overrides
        };
    }

    // =========================================================================
    // EQUIPMENT REGISTRY
    // =========================================================================
    const EQUIPMENT_DEFINITIONS = [
        { id: 'fresh_water', tag: 'FW-101', name: 'Fresh Water Feed', type: 'source', description: 'Municipal / borewell fresh water inlet' },
        { id: 'heater', tag: 'HT-101', name: 'Heater', type: 'heater', description: 'Feedstock pre-heating unit' },
        { id: 'main_feed', tag: 'BB-101', name: 'Bag Breaker', type: 'crusher', description: 'Feedstock bag opening unit' },
        { id: 'belt_conveyor', tag: 'CV-101', name: 'Belt Conveyor', type: 'conveyor', description: 'Feedstock transport conveyor' },
        { id: 'crusher', tag: 'CR-101', name: 'Crusher', type: 'crusher', description: 'Size reduction for feedstock' },
        { id: 'pre_treatment', tag: 'PT-101', name: 'Pre Treatment Tank', type: 'tank', description: 'Slurry conditioning and mixing' },
        { id: 'pretreatment_motor', tag: 'M-101', name: 'Pre-Treatment Motor', type: 'motor', description: 'Tank mixer / fan motor' },
        { id: 'main_digester', tag: 'DG-101', name: 'Main Digester', type: 'digester', description: 'Anaerobic digestion vessel' },
        { id: 'treatment_water', tag: 'TW-101', name: 'Treatment Water Tank', type: 'tank', description: 'Recycled process water storage' },
        { id: 'slurry_storage', tag: 'ST-101', name: 'Slurry Storage Tank', type: 'tank', description: 'Digested slurry buffer tank' },
        { id: 'screw_press', tag: 'SP-101', name: 'Screw Press', type: 'press', description: 'Dewatering screw press' },
        { id: 'eqilization', tag: 'EQ-101', name: 'Equalization Tank', type: 'tank', description: 'Effluent equalization' },
        { id: 'skid_etp', tag: 'ETP-101', name: 'Skid Mounted ETP', type: 'treatment', description: 'Effluent treatment package' },
        { id: 'gas_storage', tag: 'GB-101', name: 'Gas Storage Balloon', type: 'storage', description: 'Biogas buffer storage' },
        { id: 'scrubber', tag: 'SC-101', name: 'Scrubber', type: 'scrubber', description: 'H2S / CO2 removal' },
        { id: 'biogas_generator', tag: 'GEN-101', name: 'Biogas Generator', type: 'generator', description: 'CHP biogas engine generator' },
        { id: 'flaring_tank', tag: 'FL-101', name: 'Flaring Tank', type: 'flare', description: 'Emergency gas flare system' }
    ];

    const INSTRUMENT_DEFINITIONS = [
        { id: 'fit-101', tag: 'FIT-102', name: 'Slurry Feed Flow', type: 'FIT', unit: 'm³/h', equipmentId: 'main_digester', svgSelector: '[data-instrument="fit-101"]' },
        { id: 'pit-101', tag: 'PIT-103', name: 'Digester Gas Pressure', type: 'PIT', unit: 'mbar', equipmentId: 'main_digester', svgSelector: '[data-instrument="pit-101"]' },
        { id: 'pit-102', tag: 'LIT-301', name: 'Gas Balloon Level', type: 'LIT', unit: '%', equipmentId: 'gas_storage', svgSelector: '[data-instrument="pit-102"]' },
        { id: 'fit-102', tag: 'FIT-202', name: 'Biogas Header Flow', type: 'FIT', unit: 'Nm³/h', equipmentId: 'gas_storage', svgSelector: '[data-instrument="fit-102"]' },
        { id: 'pit-103', tag: 'PIT-202', name: 'Gas Header Pressure', type: 'PIT', unit: 'mbar', equipmentId: 'scrubber', svgSelector: '[data-instrument="pit-103"]' }
    ];

    const PIPE_SEGMENTS = [
        { id: 'pipe-fresh-heater', stream: 'water', selector: '.line-water' },
        { id: 'pipe-slurry-main', stream: 'slurry', selector: '.line-slurry' },
        { id: 'pipe-gas-main', stream: 'gas', selector: '.line-gas' },
        { id: 'pipe-flare', stream: 'flare', selector: '.line-flare' }
    ];

    /** Operator block buttons (top bar) */
    const BLOCK_CONTROLS = [
        { id: 'belt_conveyor', label: 'Belt Conveyor', tag: 'BC101' },
        { id: 'crusher', label: 'Crusher', tag: 'CH101' },
        { id: 'pre_treatment', label: 'Pre Treatment Tank', tag: 'P-101B' },
        { id: 'pretreatment_motor', label: 'Motor', tag: 'AG101', isMotor: true },
        { id: 'main_digester', label: 'Main Digester', tag: 'AG102' },
        { id: 'slurry_storage', label: 'Slurry Storage Tank', tag: 'P102' },
        { id: 'treatment_water', label: 'Treatment Water Tank', tag: 'P104' },
        { id: 'eqilization', label: 'Equalization Tank', tag: 'P103' }
    ];

    /** Each flow-dash segment animates when all listed blocks are ON (DOM order, 27 segments) */
    const FLOW_SEGMENT_DEPS = [
        [],                                                        // 0: Fresh water → heater
        ['crusher'],                                               // 1: Fresh water branch → crusher
        ['pre_treatment'],                                         // 2: Heater → pre-treatment
        ['belt_conveyor'],                                         // 3: Bag breaker → belt
        ['belt_conveyor', 'crusher'],                              // 4: Belt → crusher
        ['crusher', 'pre_treatment'],                              // 5: Crusher → pre-treatment
        ['treatment_water', 'crusher'],                            // 6: Treatment water recycle loop
        ['main_digester', 'slurry_storage'],                       // 7: Digester upper → slurry
        ['main_digester', 'slurry_storage'],                       // 8: Digester lower → slurry
        ['slurry_storage'],                                        // 9: Slurry → screw press
        ['slurry_storage', 'eqilization'],                         // 10: Screw press → equalization
        ['eqilization'],                                           // 11: Equalization → ETP
        ['eqilization', 'treatment_water'],                        // 12: ETP → treatment water
        ['main_digester'],                                         // 13: Biogas → gas balloon
        ['main_digester'],                                         // 14: Digester corridor → balloon area
        ['main_digester'],                                         // 15: Gas balloon → scrubber
        ['main_digester'],                                         // 16: Scrubber → generator
        ['main_digester'],                                         // 17: Flare branch
        ['crusher'],                                               // 18: Fresh water into crusher
        ['treatment_water', 'crusher'],                            // 19: Treatment water into crusher
        ['pretreatment_motor', 'pre_treatment'],                   // 20: PS → PW (standby only — see PipeFlowRenderer)
        ['pretreatment_motor', 'pre_treatment', 'main_digester'], // 21: PW → FIT → digester
        ['pretreatment_motor', 'pre_treatment', 'main_digester'],  // 22: Digester inlet (FIT)
        ['main_digester', 'slurry_storage'],                       // 23: Digester outlet stub
        ['main_digester', 'slurry_storage'],                       // 24: Digester top vertical
        ['main_digester', 'slurry_storage'],                       // 25: Digester lower outlet stub
        ['main_digester'],                                         // 26: Digester gas vent
    ];

    /** Backend RSIP tagNo (HmiPlantSetupService) → PFD equipment block id */
    const BACKEND_TAG_TO_EQUIPMENT = {
        T101: 'main_feed',
        BC101: 'belt_conveyor',
        CH101: 'crusher',
        SH102: 'heater',
        T102: 'pre_treatment',
        AG101: 'pretreatment_motor',
        'P-101A': 'pre_treatment',
        'P-101B': 'pre_treatment',
        T104: 'main_digester',
        AG102: 'main_digester',
        T105: 'slurry_storage',
        P102: 'slurry_storage',
        FP101: 'screw_press',
        T106: 'eqilization',
        P103: 'eqilization',
        T108: 'treatment_water',
        P104: 'treatment_water',
        MT101: 'scrubber',
        B101: 'gas_storage',
        SC101: 'scrubber',
        GE101: 'biogas_generator',
        FA101: 'flaring_tank'
    };

    /** Primary controllable tag for block button → start/stop */
    const EQUIPMENT_TO_BACKEND_TAG = Object.fromEntries(
        BLOCK_CONTROLS.map((b) => [b.id, b.tag])
    );

    /** Backend instrument tagNo → SVG instrument id */
    const BACKEND_INSTRUMENT_TO_HMI = {
        'FIT-102': 'fit-101',
        'PIT-103': 'pit-101',
        'LIT-301': 'pit-102',
        'FIT-202': 'fit-102',
        'PIT-202': 'pit-103'
    };

    /** Block control tags aggregated for running state (duty/standby pumps, tank+motor) */
    const BLOCK_AGGREGATE_TAGS = {
        pre_treatment: ['P-101A', 'P-101B'],
        main_digester: ['AG102'],
        slurry_storage: ['P102'],
        treatment_water: ['P104'],
        eqilization: ['P103']
    };

    /** Pre-treatment feed pumps: PS = standby (P-101A), PW = duty/working (P-101B) */
    const PRETREATMENT_PUMP_PS = 'P-101A';
    const PRETREATMENT_PUMP_PW = 'P-101B';
    const FLOW_SEGMENT_PS_TO_PW = 20;

    /** Instrument tags shown as block readings when pump has no sensor */
    const BLOCK_RELATED_SENSORS = {
        pre_treatment: ['LIT-101', 'TIT-101', 'FIT-102'],
        pretreatment_motor: ['TIT-101'],
        main_digester: ['PIT-103', 'LIT-103', 'TIT-103A', 'AIT-103'],
        slurry_storage: ['LIT-201', 'FIT-201'],
        treatment_water: ['LIT-101'],
        eqilization: ['LIT-201'],
        gas_storage: ['LIT-301', 'PIT-202', 'FIT-202']
    };

    function tagsForEquipmentId(equipId) {
        const tags = new Set();
        if (EQUIPMENT_TO_BACKEND_TAG[equipId]) tags.add(EQUIPMENT_TO_BACKEND_TAG[equipId]);
        Object.entries(BACKEND_TAG_TO_EQUIPMENT).forEach(([tag, id]) => {
            if (id === equipId) tags.add(tag);
        });
        return [...tags];
    }

    function findRelatedSensor(equipment, tagList) {
        if (!tagList?.length) return null;
        for (const tag of tagList) {
            const hit = equipment.find((eq) => eq.tagNo === tag && eq.sensorValue != null);
            if (hit) return hit;
        }
        return null;
    }

    function formatReadingValue(value, unit) {
        if (value == null || Number.isNaN(Number(value))) return '—';
        const formatted = Number(value) % 1 === 0 ? String(value) : Number(value).toFixed(1);
        return unit ? `${formatted} ${unit}` : formatted;
    }

    function formatInstrumentReading(inst) {
        if (!inst) return 'No reading';
        const display = inst.value != null ? `${inst.value} ${inst.unit}` : '—';
        return `${inst.tag}\nReading: ${display}`;
    }

    function equipmentStatusLabel(reading, eq) {
        if (reading?.inAlarm || eq?.status === 'fault' || eq?.status === 'alarm') return 'Fault';
        if (reading?.running || eq?.running) return 'Running';
        return 'Off';
    }

    function formatBlockReading(blockId, reading, eq) {
        const block = BLOCK_CONTROLS.find((b) => b.id === blockId);
        const label = block?.label || eq?.name || blockId;
        const tag = block?.tag || eq?.tag || '—';
        const lines = [`${tag} — ${label}`];

        if (reading) {
            const status = reading.inAlarm ? 'Fault' : reading.running ? 'Running' : 'Off';
            lines.push(`Status: ${status}`);
            if (reading.sensorValue != null) {
                lines.push(`Reading: ${reading.sensorValue} ${reading.sensorUnit || ''}`.trim());
            } else {
                lines.push('Reading: —');
            }
            if (reading.capacity) lines.push(`Capacity: ${reading.capacity}`);
            if (reading.motorHp) lines.push(`Motor: ${reading.motorHp} HP`);
        } else if (eq) {
            const status = eq.status === 'fault' || eq.status === 'alarm' ? 'Fault'
                : eq.running ? 'Running' : 'Off';
            lines.push(`Status: ${status}`);
            const t = eq.telemetry || {};
            if (t.sensorValue != null) {
                lines.push(`Reading: ${t.sensorValue} ${t.sensorUnit || ''}`.trim());
            } else {
                lines.push('Reading: —');
            }
        } else {
            lines.push('Reading: —');
        }

        return lines.join('\n');
    }

    function getBlockSvgElement(blockId) {
        if (blockId === 'pretreatment_motor') {
            return document.getElementById('unit-pretreatment_motor');
        }
        if (blockId === 'main_digester') {
            return document.getElementById('unit-main_digester-group')
                || document.getElementById('unit-main_digester');
        }
        return document.getElementById(`unit-${blockId}`);
    }

    class EquipmentRegistry {
        constructor() {
            this.equipment = new Map();
            this.instruments = new Map();
            EQUIPMENT_DEFINITIONS.forEach((def) => {
                this.equipment.set(def.id, createEquipmentDefaults(def));
            });
            INSTRUMENT_DEFINITIONS.forEach((def) => {
                this.instruments.set(def.id, {
                    ...def,
                    value: null,
                    quality: 'good',
                    timestamp: null,
                    communication: true
                });
            });
        }

        getEquipment(id) {
            return this.equipment.get(id);
        }

        getInstrument(id) {
            return this.instruments.get(id);
        }

        updateEquipment(id, patch) {
            const current = this.equipment.get(id);
            if (!current) return null;
            const next = { ...current, ...patch };
            if (patch.telemetry) {
                next.telemetry = { ...current.telemetry, ...patch.telemetry };
            }
            if (patch.alarms) {
                next.alarms = patch.alarms;
            }
            this.equipment.set(id, next);
            return next;
        }

        updateInstrument(id, patch) {
            const current = this.instruments.get(id);
            if (!current) return null;
            const next = { ...current, ...patch, timestamp: patch.timestamp || new Date().toISOString() };
            this.instruments.set(id, next);
            return next;
        }

        allEquipment() {
            return [...this.equipment.values()];
        }
    }

    // =========================================================================
    // STATE MANAGER
    // =========================================================================
    class StateManager {
        constructor(registry, eventBus) {
            this.registry = registry;
            this.eventBus = eventBus;
            this.selectedEquipmentId = null;
            this.streamFilter = 'all';
            this.animationPaused = false;
            this.fanRunning = false;
            this.plantStatus = 'normal';
        }

        selectEquipment(id) {
            this.selectedEquipmentId = id;
            this.eventBus.emit('equipment:selected', this.registry.getEquipment(id));
        }

        setStreamFilter(filter) {
            this.streamFilter = filter;
            this.eventBus.emit('filter:changed', filter);
        }

        setAnimationPaused(paused) {
            this.animationPaused = paused;
            this.eventBus.emit('animation:changed', paused);
        }

        setFanRunning(running) {
            this.fanRunning = running;
            const eq = this.registry.updateEquipment('pre_treatment', {
                running,
                status: running ? 'running' : 'ready'
            });
            this.eventBus.emit('equipment:updated', eq);
            this.eventBus.emit('fan:changed', running);
        }

        applyTelemetry(payload) {
            if (payload.equipmentId) {
                const eq = this.registry.updateEquipment(payload.equipmentId, payload);
                this.eventBus.emit('equipment:updated', eq);
            }
            if (payload.instrumentId) {
                const inst = this.registry.updateInstrument(payload.instrumentId, payload);
                this.eventBus.emit('instrument:updated', inst);
            }
        }
    }

    // =========================================================================
    // BLOCK CONTROL BAR (per-equipment ON/OFF buttons)
    // =========================================================================
    class BlockControlController {
        constructor(hmi) {
            this.hmi = hmi;
            this.plantPowered = false;
            this.canControl = false;
            this.buttons = new Map();
            this.pumpPsRunning = false;
            this.pumpPwRunning = false;
        }

        init() {
            BLOCK_CONTROLS.forEach((block) => {
                const btn = document.getElementById(`block-btn-${block.id}`);
                if (!btn) return;
                this.buttons.set(block.id, btn);
                btn.addEventListener('click', () => this.toggle(block.id));
            });

            this.allOnButton = document.getElementById('block-btn-all-on');
            this.allOnButton?.addEventListener('click', () => this.startAll());

            this.hmi.eventBus.on('equipment:updated', (eq) => {
                if (BLOCK_CONTROLS.some((b) => b.id === eq.id)) {
                    this._refreshBlock(eq.id);
                    this.hmi.pipeFlowRenderer?.updateFromBlocks(this);
                }
            });

            this.hmi.eventBus.on('plant:power', () => this.refreshAll());
            BLOCK_CONTROLS.forEach((b) => this._refreshBlock(b.id));
        }

        setPlantPowered(on) {
            this.plantPowered = on;
            this.refreshAll();
        }

        setCanControl(on) {
            this.canControl = on;
            this.refreshAll();
        }

        isBlockOn(id) {
            const eq = this.hmi.registry.getEquipment(id);
            return !!(eq && eq.running);
        }

        setPumpStates({ psRunning = false, pwRunning = false } = {}) {
            this.pumpPsRunning = psRunning;
            this.pumpPwRunning = pwRunning;
        }

        /** PS standby cross-feed: active only when duty pump (PW) is off and standby (PS) is running */
        isPsStandbyPathActive() {
            return this.pumpPsRunning && !this.pumpPwRunning;
        }

        toggle(id) {
            if (!this.plantPowered) return;
            const eq = this.hmi.registry.getEquipment(id);
            if (!eq) return;

            const tag = EQUIPMENT_TO_BACKEND_TAG[id];
            const action = eq.running ? 'STOP' : 'START';

            if (this.hmi.parentBridge?.embedded) {
                this.hmi.parentBridge.sendCommand(tag, action);
                return;
            }

            const running = !eq.running;
            this._applyLocalState(id, running, eq.status === 'fault' ? 'fault' : (running ? 'running' : 'ready'));
        }

        startAll() {
            if (!this.plantPowered) return;

            if (this.hmi.parentBridge?.embedded) {
                BLOCK_CONTROLS.forEach((block) => {
                    const eq = this.hmi.registry.getEquipment(block.id);
                    if (!eq?.running) {
                        this.hmi.parentBridge.sendCommand(EQUIPMENT_TO_BACKEND_TAG[block.id], 'START');
                    }
                });
                return;
            }

            BLOCK_CONTROLS.forEach((block) => {
                const eq = this.hmi.registry.getEquipment(block.id);
                if (eq && !eq.running) {
                    this._applyLocalState(block.id, true, eq.status === 'fault' ? 'fault' : 'running');
                }
            });
        }

        syncBlock(id, { running, fault }) {
            const status = fault ? 'fault' : (running ? 'running' : 'ready');
            this.hmi.registry.updateEquipment(id, {
                running,
                power: this.plantPowered,
                status: this.plantPowered ? status : 'off',
                health: fault ? 'warning' : 'normal'
            });
            if (BLOCK_CONTROLS.find((b) => b.id === id)?.isMotor) {
                this._setMotorFan(running);
            }
        }

        _applyLocalState(id, running, status) {
            const eq = this.hmi.registry.updateEquipment(id, {
                running,
                power: this.plantPowered,
                status: this.plantPowered ? status : 'off'
            });
            if (id === 'pre_treatment') {
                this.setPumpStates({ psRunning: false, pwRunning: running });
            }
            if (eq) {
                this.hmi.eventBus.emit('equipment:updated', eq);
                if (BLOCK_CONTROLS.find((b) => b.id === id)?.isMotor) {
                    this._setMotorFan(running);
                }
            }
            this._refreshBlock(id);
            this.hmi.pipeFlowRenderer?.updateFromBlocks(this);
        }

        _visualState(eq) {
            if (!this.plantPowered) return 'idle';
            if (eq.status === 'fault' || eq.status === 'alarm' || eq.health === 'warning') return 'fault';
            if (eq.running) return 'on';
            return 'off';
        }

        _refreshBlock(id) {
            const eq = this.hmi.registry.getEquipment(id);
            const btn = this.buttons.get(id);
            if (!eq || !btn) return;

            const visual = this._visualState(eq);
            btn.classList.remove('on', 'off', 'fault', 'neutral');
            btn.classList.add(visual === 'idle' ? 'neutral' : visual);
            btn.disabled = !this.plantPowered || !this.canControl;
            btn.setAttribute('aria-pressed', eq.running ? 'true' : 'false');

            this.hmi.equipmentRenderer?.applyBlockVisual(id, visual);
        }

        refreshAll() {
            BLOCK_CONTROLS.forEach((b) => this._refreshBlock(b.id));
            if (this.allOnButton) {
                const allRunning = BLOCK_CONTROLS.every((b) => this.isBlockOn(b.id));
                this.allOnButton.disabled = !this.plantPowered || !this.canControl || allRunning;
            }
            this.hmi.pipeFlowRenderer?.updateFromBlocks(this);
        }

        _setMotorFan(running) {
            const svg = this.hmi.svg;
            const fanAnim = document.getElementById('fan-rotate-anim');
            const fanRotor = document.getElementById('pretreatment-fan-rotor');
            if (!svg) return;

            if (running) {
                svg.classList.add('fan-rotating');
                fanAnim?.beginElement();
            } else {
                svg.classList.remove('fan-rotating');
                fanAnim?.endElement();
                fanRotor?.removeAttribute('transform');
            }
        }
    }

    // =========================================================================
    // REACT PARENT BRIDGE (PlantHmi ↔ iframe postMessage protocol)
    // =========================================================================
    class ParentBridge {
        constructor(hmi) {
            this.hmi = hmi;
            this.plantPowered = false;
            this.canControl = false;
            this.controllableTags = new Set();
            this.blockState = new Map();
            this.blockReadings = new Map();
        }

        init(embedded) {
            this.embedded = embedded;
            if (!embedded) return;

            window.addEventListener('message', (event) => {
                const data = event.data;
                if (!data || data.type !== 'HMI_STATE') return;
                this.applyHmiState(data.payload || {});
            });

            this.hmi.eventBus.on('hmi:ready', () => {
                window.parent.postMessage({ type: 'PFD_READY' }, '*');
            });

            this.hmi.eventBus.on('equipment:click', (id) => {
                if (!this.embedded) return;
                window.parent.postMessage({
                    type: 'PFD_UNIT_CLICK',
                    id,
                    tags: tagsForEquipmentId(id),
                }, '*');
            });
        }

        sendCommand(tag, action) {
            if (!this.embedded || !this.canControl) return;
            if (!this.plantPowered && action !== 'POWER_ON') return;
            window.parent.postMessage({ type: 'PFD_BLOCK_COMMAND', tag, action }, '*');
        }

        isBlockControllable(equipId) {
            const tag = EQUIPMENT_TO_BACKEND_TAG[equipId];
            return !!(tag && this.controllableTags.has(tag));
        }

        applyHmiState(payload) {
            const {
                plantPowered = false,
                equipment = [],
                highlightTags = null,
                canControl = false,
                maximized = false,
            } = payload;
            document.body.classList.toggle('embedded-maximized', maximized);
            this.plantPowered = plantPowered;
            this.canControl = canControl;
            this.controllableTags.clear();
            this.blockState.clear();
            this.blockReadings.clear();

            const psPump = equipment.find((eq) => eq.tagNo === PRETREATMENT_PUMP_PS);
            const pwPump = equipment.find((eq) => eq.tagNo === PRETREATMENT_PUMP_PW);
            this.hmi.blockControl?.setPumpStates({
                psRunning: plantPowered && !!psPump?.running,
                pwRunning: plantPowered && !!pwPump?.running,
            });

            const aggregated = new Map();

            equipment.forEach((eq) => {
                if (!eq?.tagNo || eq.tagNo.startsWith('HTML-PFD')) return;

                const instrumentId = BACKEND_INSTRUMENT_TO_HMI[eq.tagNo];
                if (instrumentId) {
                    const inst = this.hmi.registry.updateInstrument(instrumentId, {
                        value: eq.sensorValue ?? null,
                        quality: eq.inAlarm ? 'bad' : 'good'
                    });
                    if (inst) {
                        const group = document.querySelector(inst.svgSelector);
                        if (group) {
                            group.setAttribute('data-quality', inst.quality || 'good');
                            group.setAttribute('data-comm', inst.communication ? 'ok' : 'lost');
                        }
                        this.hmi.eventBus.emit('instrument:updated', inst);
                    }
                }

                const equipId = BACKEND_TAG_TO_EQUIPMENT[eq.tagNo];
                if (!equipId) return;

                if (eq.controllable) this.controllableTags.add(eq.tagNo);

                const prev = aggregated.get(equipId) || {
                    powered: false,
                    running: false,
                    fault: false,
                    controlTag: EQUIPMENT_TO_BACKEND_TAG[equipId] || eq.tagNo
                };
                prev.powered = prev.powered || !!eq.powered;
                prev.running = prev.running || !!eq.running;
                prev.fault = prev.fault || !!eq.inAlarm;
                if (eq.controllable && EQUIPMENT_TO_BACKEND_TAG[equipId] === eq.tagNo) {
                    prev.controlTag = eq.tagNo;
                }
                aggregated.set(equipId, prev);
            });

            this.hmi.registry.allEquipment().forEach((block) => {
                const state = aggregated.get(block.id);
                let status = 'off';
                let power = false;
                let running = false;

                if (plantPowered && state) {
                    power = state.powered;
                    running = state.running;
                    if (state.fault) status = 'fault';
                    else if (state.running) status = 'running';
                    else if (state.powered) status = 'ready';
                }

                const updated = this.hmi.registry.updateEquipment(block.id, {
                    power,
                    running,
                    status,
                    health: state?.fault ? 'warning' : 'normal',
                    communication: true,
                });
                if (updated) this.hmi.eventBus.emit('equipment:updated', updated);
            });

            BLOCK_CONTROLS.forEach((bc) => {
                const aggregateTags = BLOCK_AGGREGATE_TAGS[bc.id];
                const controlEq = aggregateTags
                    ? equipment.find((eq) => aggregateTags.includes(eq.tagNo))
                    : equipment.find((eq) => eq.tagNo === bc.tag);
                const relatedEqs = aggregateTags
                    ? equipment.filter((eq) => aggregateTags.includes(eq.tagNo))
                    : (controlEq ? [controlEq] : []);
                const running = plantPowered && relatedEqs.some((eq) => eq.running);
                const fault = plantPowered && relatedEqs.some((eq) => eq.inAlarm);
                const powered = plantPowered && relatedEqs.some((eq) => eq.powered);
                const sensorEq = controlEq?.sensorValue != null
                    ? controlEq
                    : findRelatedSensor(equipment, BLOCK_RELATED_SENSORS[bc.id]);
                this.blockState.set(bc.id, {
                    powered,
                    running,
                    controlTag: bc.tag,
                    controllable: relatedEqs.some((eq) => eq.controllable),
                });
                if (controlEq || sensorEq) {
                    this.blockReadings.set(bc.id, {
                        tag: bc.tag,
                        label: bc.label,
                        name: controlEq?.name || sensorEq?.name,
                        running,
                        inAlarm: fault,
                        sensorValue: sensorEq?.sensorValue ?? controlEq?.sensorValue,
                        sensorUnit: sensorEq?.sensorUnit ?? controlEq?.sensorUnit,
                        motorHp: controlEq?.motorHp,
                        capacity: controlEq?.capacity,
                        mode: controlEq?.mode,
                    });
                    this.hmi.registry.updateEquipment(bc.id, {
                        telemetry: {
                            sensorValue: sensorEq?.sensorValue ?? controlEq?.sensorValue,
                            sensorUnit: sensorEq?.sensorUnit ?? controlEq?.sensorUnit,
                            motorHp: controlEq?.motorHp,
                            capacity: controlEq?.capacity,
                        },
                        controlMode: controlEq?.mode ? String(controlEq.mode).toLowerCase() : 'auto',
                    });
                }
                this.hmi.blockControl?.syncBlock(bc.id, { running, fault });
            });

            this.hmi.blockControl?.setPlantPowered(plantPowered);
            this.hmi.blockControl?.setCanControl(canControl);
            this.hmi.blockControl?.refreshAll();
            this.hmi.widgetBar?.updateFromState(equipment, plantPowered);
            this._applyHighlight(highlightTags);
            this.hmi.eventBus.emit('readings:updated');
        }

        _applyHighlight(highlightTags) {
            const highlightIds = new Set();
            if (highlightTags?.length) {
                highlightTags.forEach((tag) => {
                    const equipId = BACKEND_TAG_TO_EQUIPMENT[tag];
                    if (equipId) highlightIds.add(equipId);
                    const instrumentId = BACKEND_INSTRUMENT_TO_HMI[tag];
                    if (instrumentId) {
                        const inst = this.hmi.registry.getInstrument(instrumentId);
                        if (inst?.equipmentId) highlightIds.add(inst.equipmentId);
                    }
                });
            }

            const dim = highlightIds.size > 0;
            this.hmi.registry.allEquipment().forEach((eq) => {
                const el = document.getElementById(`unit-${eq.id}`) ||
                    (eq.id === 'main_digester' ? document.getElementById('unit-main_digester') : null);
                if (!el) return;
                el.classList.toggle('zone-highlight', dim && highlightIds.has(eq.id));
                el.classList.toggle('zone-dimmed', dim && !highlightIds.has(eq.id));
            });

            INSTRUMENT_DEFINITIONS.forEach((def) => {
                const group = document.querySelector(def.svgSelector);
                if (!group) return;
                group.classList.toggle('zone-highlight', dim && highlightIds.has(def.equipmentId));
                group.classList.toggle('zone-dimmed', dim && !highlightIds.has(def.equipmentId));
            });
        }
    }

    // =========================================================================
    // MESSAGE PARSER (postMessage bridge for Swarm Operator)
    // =========================================================================
    class MessageParser {
        constructor(stateManager, eventBus) {
            this.stateManager = stateManager;
            this.eventBus = eventBus;
        }

        parse(raw) {
            let message = raw;
            if (typeof raw === 'string') {
                try { message = JSON.parse(raw); } catch { return; }
            }
            if (!message || !message.type) return;

            switch (message.type) {
                case 'telemetry':
                    this.stateManager.applyTelemetry(message.payload || message);
                    break;
                case 'alarm':
                    this._handleAlarm(message.payload || message);
                    break;
                case 'config':
                    this.eventBus.emit('config:received', message.payload);
                    break;
                case 'heartbeat':
                    this.eventBus.emit('heartbeat', message.payload);
                    break;
                default:
                    this.eventBus.emit('message:unknown', message);
            }
        }

        _handleAlarm(payload) {
            if (!payload.equipmentId) return;
            const eq = this.stateManager.registry.getEquipment(payload.equipmentId);
            if (!eq) return;
            const alarms = [...eq.alarms, payload];
            this.stateManager.registry.updateEquipment(payload.equipmentId, {
                alarms,
                status: payload.level === 'critical' || payload.level === 'trip' ? 'alarm' : eq.status
            });
            this.eventBus.emit('alarm:received', payload);
        }

        listen() {
            window.addEventListener('message', (event) => {
                this.parse(event.data);
            });
        }
    }

    // =========================================================================
    // COMPONENT RENDERERS
    // =========================================================================
    class EquipmentRenderer {
        constructor(svg, registry, eventBus) {
            this.svg = svg;
            this.registry = registry;
            this.eventBus = eventBus;
            this.statusLayer = svg.querySelector('#equipment-status-layer');
            this.ledNodes = new Map();
        }

        init() {
            this._bindEquipmentClicks();
            // Status LED dots on blocks disabled — block green/red/yellow fill is sufficient
            if (this.statusLayer) this.statusLayer.innerHTML = '';
        }

        _bindEquipmentClicks() {
            this.registry.allEquipment().forEach((eq) => {
                const el = document.getElementById(`unit-${eq.id}`);
                if (!el) return;
                el.style.cursor = 'pointer';
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.eventBus.emit('equipment:click', eq.id);
                });
            });
            const digesterGroup = document.getElementById('unit-main_digester-group');
            if (digesterGroup) {
                digesterGroup.querySelectorAll('.unit-box').forEach((el) => {
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.eventBus.emit('equipment:click', 'main_digester');
                    });
                });
            }
        }

        _renderAllStatusClusters() {
            this.registry.allEquipment().forEach((eq) => this._renderStatusCluster(eq.id));
        }

        _renderStatusCluster(id) {
            const el = document.getElementById(`unit-${id}`) ||
                (id === 'main_digester' ? document.getElementById('unit-main_digester') : null);
            if (!el || !this.statusLayer) return;

            const box = el.getBBox();
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'status-cluster');
            g.setAttribute('data-equipment-id', id);
            g.setAttribute('transform', `translate(${box.x + 4}, ${box.y + 4})`);

            SWARM_CONSTANTS.LED_TYPES.forEach((type, index) => {
                const led = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                led.setAttribute('class', `status-led led-${type}`);
                led.setAttribute('cx', index * 9);
                led.setAttribute('cy', 0);
                led.setAttribute('r', 3);
                led.setAttribute('data-led', type);
                g.appendChild(led);
            });

            this.statusLayer.appendChild(g);
            this.ledNodes.set(id, g);
            this._updateStatusCluster(id);
        }

        _updateStatusCluster(id) {
            const eq = this.registry.getEquipment(id);
            const cluster = this.ledNodes.get(id);
            if (!eq || !cluster) return;

            const map = {
                power: eq.power ? 'on' : 'lost',
                running: eq.running ? 'on' : 'off',
                health: eq.health === 'normal' ? 'on' : eq.health,
                mode: eq.controlMode === 'auto' ? 'auto' : eq.controlMode === 'remote' ? 'remote' : 'manual',
                comm: eq.communication ? 'on' : 'lost',
                alarm: eq.alarms.length > 0 || eq.status === 'alarm' || eq.status === 'fault' ? 'active' : 'off'
            };

            cluster.querySelectorAll('.status-led').forEach((led) => {
                const type = led.getAttribute('data-led');
                led.setAttribute('data-state', map[type] || 'off');
            });
        }

        setSelected(id) {
            document.querySelectorAll('.unit-box').forEach((el) => el.classList.remove('selected'));
            const el = document.getElementById(`unit-${id}`) ||
                (id === 'main_digester' ? document.getElementById('unit-main_digester') : null);
            if (el) el.classList.add('selected');
        }

        applyBlockVisual(id, visual) {
            const className = visual === 'on' ? 'block-on'
                : visual === 'off' ? 'block-off'
                    : visual === 'fault' ? 'block-fault' : 'block-idle';

            const targets = [];
            const main = document.getElementById(`unit-${id}`);
            if (main) targets.push(main);

            if (id === 'main_digester') {
                document.querySelectorAll('#unit-main_digester-group .unit-box').forEach((el) => targets.push(el));
            }

            targets.forEach((el) => {
                el.classList.remove('block-on', 'block-off', 'block-fault', 'block-idle');
                el.classList.add(className);
            });

            if (id === 'pretreatment_motor') {
                const motor = document.getElementById('unit-pretreatment_motor');
                if (motor) targets.push(motor);
            }
        }
    }

    class ReadingTooltipController {
        constructor(registry, eventBus, hmi) {
            this.registry = registry;
            this.eventBus = eventBus;
            this.hmi = hmi;
            this.tooltip = document.getElementById('reading-tooltip');
            this._activeKey = null;
        }

        init() {
            INSTRUMENT_DEFINITIONS.forEach((def) => {
                const node = document.querySelector(def.svgSelector);
                if (!node) return;
                node.style.cursor = 'pointer';
                this._bindHover(node, () => {
                    const inst = this.registry.getInstrument(def.id);
                    return formatInstrumentReading(inst);
                }, `instrument:${def.id}`);
            });

            BLOCK_CONTROLS.forEach((block) => {
                const node = getBlockSvgElement(block.id);
                if (!node) return;
                node.style.cursor = 'pointer';
                this._bindHover(node, () => {
                    const reading = this.hmi.parentBridge?.blockReadings?.get(block.id);
                    const eq = this.registry.getEquipment(block.id);
                    return formatBlockReading(block.id, reading, eq);
                }, `block:${block.id}`);
            });

            this.eventBus.on('instrument:updated', (inst) => {
                if (this._activeKey === `instrument:${inst.id}` && this.tooltip) {
                    this.tooltip.textContent = formatInstrumentReading(inst);
                }
            });
        }

        _bindHover(el, getText, key) {
            el.addEventListener('mouseenter', (event) => {
                this._activeKey = key;
                this._show(getText(), event);
            });
            el.addEventListener('mousemove', (event) => this._move(event));
            el.addEventListener('mouseleave', () => {
                this._activeKey = null;
                this._hide();
            });
        }

        _show(text, event) {
            if (!this.tooltip) return;
            this.tooltip.textContent = text;
            this.tooltip.style.display = 'block';
            this.tooltip.setAttribute('aria-hidden', 'false');
            this._move(event);
        }

        _move(event) {
            if (!this.tooltip) return;
            this.tooltip.style.left = `${event.clientX + 14}px`;
            this.tooltip.style.top = `${event.clientY + 14}px`;
        }

        _hide() {
            if (!this.tooltip) return;
            this.tooltip.style.display = 'none';
            this.tooltip.setAttribute('aria-hidden', 'true');
        }
    }

    class ReadingsPanelController {
        constructor(registry, eventBus, hmi) {
            this.registry = registry;
            this.eventBus = eventBus;
            this.hmi = hmi;
            this.equipmentBody = document.getElementById('equipment-readings-body');
            this.instrumentBody = document.getElementById('instrument-readings-body');
            this.updatedAt = document.getElementById('readings-updated-at');
            this.equipmentRows = new Map();
            this.instrumentRows = new Map();
        }

        init() {
            this.equipmentBody = document.getElementById('equipment-readings-body');
            this.instrumentBody = document.getElementById('instrument-readings-body');
            this.updatedAt = document.getElementById('readings-updated-at');
            if (!this.equipmentBody || !this.instrumentBody) return;

            BLOCK_CONTROLS.forEach((block) => {
                let row = this.equipmentBody.querySelector(`[data-block-id="${block.id}"]`);
                if (!row) {
                    row = document.createElement('tr');
                    row.dataset.blockId = block.id;
                    row.innerHTML = `
                        <td class="readings-point">
                            <span class="readings-tag">${block.tag}</span>
                            <span class="readings-name">${block.label}</span>
                        </td>
                        <td class="readings-value" data-field="value">—</td>
                        <td class="readings-status status-off" data-field="status">Off</td>
                    `;
                    this.equipmentBody.appendChild(row);
                }
                this.equipmentRows.set(block.id, row);
            });

            INSTRUMENT_DEFINITIONS.forEach((def) => {
                let row = this.instrumentBody.querySelector(`[data-instrument-id="${def.id}"]`);
                if (!row) {
                    row = document.createElement('tr');
                    row.dataset.instrumentId = def.id;
                    row.innerHTML = `
                        <td class="readings-point">
                            <span class="readings-tag">${def.tag}</span>
                            <span class="readings-name">${def.name}</span>
                        </td>
                        <td class="readings-value" data-field="value">—</td>
                        <td class="readings-status status-normal" data-field="status">OK</td>
                    `;
                    this.instrumentBody.appendChild(row);
                }
                this.instrumentRows.set(def.id, row);
            });

            this.eventBus.on('readings:updated', () => this.refresh());
            this.eventBus.on('instrument:updated', () => this.refresh());
            this.refresh();
        }

        _setStatus(cell, label) {
            if (!cell) return;
            const cssKey = label === 'OK' ? 'normal' : label.toLowerCase();
            cell.textContent = label;
            cell.className = `readings-status status-${cssKey}`;
        }

        refresh() {
            const bridge = this.hmi.parentBridge;

            BLOCK_CONTROLS.forEach((block) => {
                const row = this.equipmentRows.get(block.id);
                if (!row) return;
                const reading = bridge?.blockReadings?.get(block.id);
                const eq = this.registry.getEquipment(block.id);
                const valueCell = row.querySelector('[data-field="value"]');
                const statusCell = row.querySelector('[data-field="status"]');
                const sensorValue = reading?.sensorValue ?? eq?.telemetry?.sensorValue;
                const sensorUnit = reading?.sensorUnit ?? eq?.telemetry?.sensorUnit;
                valueCell.textContent = formatReadingValue(sensorValue, sensorUnit);
                this._setStatus(statusCell, equipmentStatusLabel(reading, eq));
            });

            INSTRUMENT_DEFINITIONS.forEach((def) => {
                const row = this.instrumentRows.get(def.id);
                if (!row) return;
                const inst = this.registry.getInstrument(def.id);
                const valueCell = row.querySelector('[data-field="value"]');
                const statusCell = row.querySelector('[data-field="status"]');
                valueCell.textContent = formatReadingValue(inst?.value, inst?.unit);
                const status = inst?.quality === 'bad' ? 'Alarm' : 'OK';
                this._setStatus(statusCell, status);
            });

            if (this.updatedAt) {
                this.updatedAt.textContent = new Date().toLocaleTimeString();
            }
        }
    }

    class PipeFlowRenderer {
        constructor(svg, eventBus) {
            this.svg = svg;
            this.eventBus = eventBus;
            this.segments = [];
        }

        init() {
            this.segments = Array.from(this.svg.querySelectorAll('.flow-dash')).map((dash, index) => {
                const line = dash.previousElementSibling;
                const bg = line?.previousElementSibling;
                return {
                    dash,
                    line: line?.classList?.contains('flow-line') ? line : null,
                    bg: bg?.classList?.contains('flow-line-bg') ? bg : null,
                    index
                };
            });
            this.segments.forEach((segment) => {
                this._setSegmentState(segment, 'none');
            });
            this.updateFromBlocks(null);
        }

        _setSegmentState(segment, state) {
            segment.dash.setAttribute('data-flow-state', state);
            segment.dash.dataset.flowIndex = String(segment.index);
            if (segment.line) segment.line.setAttribute('data-flow-state', state);
            if (segment.bg) segment.bg.setAttribute('data-flow-state', state);
        }

        updateFromBlocks(blockControl) {
            const plantOn = blockControl?.plantPowered ?? false;
            const isOn = (id) => (plantOn && blockControl ? blockControl.isBlockOn(id) : false);

            this.segments.forEach((segment, index) => {
                let state = 'none';
                if (plantOn) {
                    if (index === FLOW_SEGMENT_PS_TO_PW) {
                        if (isOn('pretreatment_motor') && blockControl?.isPsStandbyPathActive?.()) {
                            state = 'normal';
                        }
                    } else {
                        const deps = FLOW_SEGMENT_DEPS[index] || [];
                        if (deps.length === 0 || deps.every((dep) => isOn(dep))) {
                            state = 'normal';
                        }
                    }
                }
                this._setSegmentState(segment, state);
            });
        }

        setFlowState(streamClass, state) {
            this.svg.querySelectorAll(`.flow-dash.${streamClass}`).forEach((el) => {
                el.setAttribute('data-flow-state', state);
            });
        }
    }

    class PanelController {
        constructor(registry, eventBus) {
            this.registry = registry;
            this.eventBus = eventBus;
            this.parentBridge = null;
            this.panel = document.getElementById('equipment-panel');
            this.backdrop = document.getElementById('panel-backdrop');
            this.controls = document.getElementById('panel-controls');
            this.hint = document.getElementById('panel-hint');
            this.buttons = {
                powerOn: document.getElementById('panel-btn-power-on'),
                start: document.getElementById('panel-btn-start'),
                stop: document.getElementById('panel-btn-stop'),
                powerOff: document.getElementById('panel-btn-power-off')
            };
            this.fields = {
                name: document.getElementById('panel-name'),
                tag: document.getElementById('panel-tag'),
                description: document.getElementById('panel-description'),
                status: document.getElementById('panel-status'),
                mode: document.getElementById('panel-mode'),
                hours: document.getElementById('panel-hours'),
                power: document.getElementById('panel-power'),
                current: document.getElementById('panel-current'),
                temperature: document.getElementById('panel-temperature'),
                maintenance: document.getElementById('panel-maintenance'),
                alarm: document.getElementById('panel-alarm'),
                trend: document.getElementById('panel-trend'),
                ai: document.getElementById('panel-ai')
            };
        }

        setParentBridge(bridge) {
            this.parentBridge = bridge;
        }

        init() {
            this.eventBus.on('equipment:click', (id) => this.open(id));
            this.eventBus.on('equipment:selected', (eq) => { if (eq) this._populate(eq); });
            this.eventBus.on('equipment:updated', (eq) => {
                if (eq && eq.id === this._currentId) this._populate(eq);
            });
            document.getElementById('panel-close')?.addEventListener('click', () => this.close());
            this.backdrop?.addEventListener('click', () => this.close());

            this.buttons.powerOn?.addEventListener('click', () => this._sendCommand('POWER_ON'));
            this.buttons.start?.addEventListener('click', () => this._sendCommand('START'));
            this.buttons.stop?.addEventListener('click', () => this._sendCommand('STOP'));
            this.buttons.powerOff?.addEventListener('click', () => this._sendCommand('POWER_OFF'));
        }

        _sendCommand(action) {
            const tag = EQUIPMENT_TO_BACKEND_TAG[this._currentId];
            if (!tag || !this.parentBridge) return;
            this.parentBridge.sendCommand(tag, action);
        }

        _updateControls(eq) {
            const bridge = this.parentBridge;
            const block = bridge?.blockState?.get(eq.id);
            const controllable = block?.controllable;
            const canControl = bridge?.canControl;
            const plantPowered = bridge?.plantPowered;

            if (!this.controls) return;

            if (!controllable || !canControl) {
                this.controls.hidden = true;
                return;
            }

            this.controls.hidden = false;
            const disabled = !plantPowered;
            const { powerOn, start, stop, powerOff } = this.buttons;

            if (powerOn) {
                powerOn.hidden = eq.power;
                powerOn.disabled = disabled;
            }
            if (start) {
                start.hidden = !eq.power || eq.running;
                start.disabled = disabled;
            }
            if (stop) {
                stop.hidden = !eq.running;
                stop.disabled = disabled;
            }
            if (powerOff) {
                powerOff.hidden = !eq.power;
                powerOff.disabled = disabled;
            }
            if (this.hint) this.hint.hidden = plantPowered;
        }

        open(id) {
            this._currentId = id;
            const eq = this.registry.getEquipment(id);
            if (!eq) return;
            this.eventBus.emit('equipment:selected', eq);
            this.panel?.classList.add('open');
            this.backdrop?.classList.add('open');
        }

        close() {
            this._currentId = null;
            this.panel?.classList.remove('open');
            this.backdrop?.classList.remove('open');
            document.querySelectorAll('.unit-box').forEach((el) => el.classList.remove('selected'));
        }

        _populate(eq) {
            const t = eq.telemetry || {};
            this.fields.name.textContent = eq.name;
            this.fields.tag.textContent = eq.tag;
            this.fields.description.textContent = eq.description || '—';
            this.fields.status.textContent = eq.status;
            this.fields.mode.textContent = eq.controlMode;
            this.fields.hours.textContent = t.runningHours != null ? `${t.runningHours} h` : '—';
            this.fields.power.textContent = t.powerKw != null ? `${t.powerKw} kW` : '—';
            this.fields.current.textContent = t.motorCurrentA != null ? `${t.motorCurrentA} A` : '—';
            this.fields.temperature.textContent = t.temperatureC != null ? `${t.temperatureC} °C` : '—';
            this.fields.maintenance.textContent = t.lastMaintenance || '—';
            this.fields.alarm.textContent = eq.alarms.length
                ? eq.alarms.map((a) => a.message || a.level).join('; ')
                : 'None';
            this.fields.trend.textContent = 'Trend widget — connect via Swarm Operator';
            this.fields.ai.textContent = eq.aiRecommendation || 'Awaiting Swarm Operator recommendation';
            this._updateControls(eq);
        }
    }

    class WidgetBarController {
        constructor(registry) {
            this.registry = registry;
        }

        init() {
            this._seedDemoValues();
        }

        updateFromState(equipment, plantPowered) {
            const set = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            };

            let alarmCount = 0;
            let digesterTemp = null;
            let digesterPressure = null;
            let gasFlow = null;
            let methane = null;
            let methaneUnit = 'ppm';
            let runningCount = 0;

            (equipment || []).forEach((eq) => {
                if (eq.inAlarm) alarmCount += 1;
                if (eq.running) runningCount += 1;
                if (eq.tagNo === 'TIT-103A' || eq.tagNo === 'TIT-103B') digesterTemp = eq.sensorValue;
                if (eq.tagNo === 'PIT-103') digesterPressure = eq.sensorValue;
                if (eq.tagNo === 'FIT-202' || eq.tagNo === 'FIT-301') gasFlow = eq.sensorValue;
                if (eq.tagNo === 'AIT-202') {
                    methane = eq.sensorValue;
                    methaneUnit = eq.sensorUnit || 'ppm';
                }
            });

            const healthPct = equipment?.length
                ? Math.round(((equipment.length - alarmCount) / equipment.length) * 100)
                : null;

            set('widget-plant-status', plantPowered ? 'Normal' : 'Off');
            set('widget-gas-production', gasFlow != null ? `${Number(gasFlow).toFixed(1)} Nm³/h` : '—');
            set('widget-methane', methane != null ? `${Number(methane).toFixed(1)} ${methaneUnit}` : '—');
            set('widget-digester-temp', digesterTemp != null ? `${Number(digesterTemp).toFixed(1)} °C` : '—');
            set('widget-digester-pressure', digesterPressure != null ? `${Number(digesterPressure).toFixed(1)} mbar` : '—');
            set('widget-generation', runningCount > 0 ? `${(runningCount * 4.2).toFixed(1)} kW` : '— kW');
            set('widget-efficiency', plantPowered && runningCount > 0 ? `${Math.min(92, 68 + runningCount * 3)} %` : '—');
            set('widget-active-alarms', String(alarmCount));
            set('widget-health', healthPct != null ? `${healthPct}%` : '—');
        }

        _seedDemoValues() {
            const set = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            };
            set('widget-plant-status', 'Normal');
            set('widget-gas-production', '—');
            set('widget-methane', '—');
            set('widget-digester-temp', '—');
            set('widget-digester-pressure', '—');
            set('widget-generation', '—');
            set('widget-efficiency', '—');
            set('widget-active-alarms', '0');
            set('widget-health', '—');
        }
    }

    // =========================================================================
    // MAIN APPLICATION
    // =========================================================================
    class SwarmHMI {
        constructor() {
            this.eventBus = new EventBus();
            this.registry = new EquipmentRegistry();
            this.stateManager = new StateManager(this.registry, this.eventBus);
            this.svg = document.getElementById('pfd-svg');
        }

        init() {
            this.equipmentRenderer = new EquipmentRenderer(this.svg, this.registry, this.eventBus);
            this.readingTooltip = new ReadingTooltipController(this.registry, this.eventBus, this);
            this.readingsPanel = new ReadingsPanelController(this.registry, this.eventBus, this);
            this.pipeFlowRenderer = new PipeFlowRenderer(this.svg, this.eventBus);
            this.panelController = new PanelController(this.registry, this.eventBus);
            this.widgetBar = new WidgetBarController(this.registry);
            this.blockControl = new BlockControlController(this);
            this.messageParser = new MessageParser(this.stateManager, this.eventBus);

            this.equipmentRenderer.init();
            this.readingTooltip.init();
            this.pipeFlowRenderer.init();
            this.panelController.init();
            this.widgetBar.init();
            this.blockControl.init();
            this.messageParser.listen();

            const embedded = window.parent !== window;
            if (embedded || new URLSearchParams(window.location.search).get('embedded') === '1') {
                document.body.classList.add('embedded');
                document.querySelector('.hmi-main')?.classList.add('embedded-layout');
            }
            this.parentBridge = new ParentBridge(this);
            this.parentBridge.init(embedded);
            this.panelController.setParentBridge(this.parentBridge);
            this.readingsPanel.init();
            if (!embedded) {
                this._seedDemoState();
            } else {
                this.eventBus.emit('readings:updated');
            }

            this.eventBus.on('equipment:selected', (eq) => {
                if (eq) this.equipmentRenderer.setSelected(eq.id);
            });

            global.SwarmHMI = this;

            this.eventBus.emit('hmi:ready', { version: '1.0.0' });
        }

        _seedDemoState() {
            const demoReadings = {
                belt_conveyor: { sensorValue: 185.0, sensorUnit: 'kg/h', capacity: '200 KG/HR', motorHp: 2 },
                crusher: { sensorValue: 520.0, sensorUnit: 'kg/h', capacity: '600 KG/HR', motorHp: 5 },
                pre_treatment: { sensorValue: 8.4, sensorUnit: 'm³/h', capacity: '10 CUM/HR', motorHp: 2 },
                pretreatment_motor: { sensorValue: 42.1, sensorUnit: '°C', motorHp: 3 },
                main_digester: { sensorValue: 18.5, sensorUnit: 'mbar', motorHp: 2 },
                slurry_storage: { sensorValue: 68, sensorUnit: '%', capacity: '2 CUM/HR', motorHp: 1 },
                treatment_water: { sensorValue: 74, sensorUnit: '%', capacity: '5 CUM/HR', motorHp: 2 },
                eqilization: { sensorValue: 55, sensorUnit: '%', capacity: '5 CUM/HR', motorHp: 2 },
            };

            BLOCK_CONTROLS.forEach((block) => {
                const demo = demoReadings[block.id] || {};
                this.registry.updateEquipment(block.id, {
                    status: 'off',
                    running: false,
                    power: false,
                    telemetry: demo,
                });
                this.parentBridge?.blockReadings?.set(block.id, {
                    tag: block.tag,
                    label: block.label,
                    running: false,
                    inAlarm: false,
                    ...demo,
                });
            });
            this.registry.updateInstrument('fit-101', { value: 4.2, quality: 'good' });
            this.registry.updateInstrument('pit-101', { value: 18.5, quality: 'good' });
            this.registry.updateInstrument('pit-102', { value: 12.0, quality: 'good' });
            this.registry.updateInstrument('fit-102', { value: 86.0, quality: 'good' });
            this.registry.updateInstrument('pit-103', { value: 8.2, quality: 'good' });
            INSTRUMENT_DEFINITIONS.forEach((d) => this.eventBus.emit('instrument:updated', this.registry.getInstrument(d.id)));
            this.blockControl.refreshAll();
            this.eventBus.emit('readings:updated');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        new SwarmHMI().init();
    });

})(window);
