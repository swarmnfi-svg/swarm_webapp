package com.biopower.util;

import com.biopower.model.enums.ReadingType;
import com.biopower.model.enums.SensorType;

import java.util.EnumMap;
import java.util.Map;

public final class PartnerMetricCatalog {

    private static final Map<SensorType, String> UNITS = new EnumMap<>(SensorType.class);
    private static final Map<SensorType, ReadingType> READING_TYPES = new EnumMap<>(SensorType.class);

    static {
        UNITS.put(SensorType.PH, "");
        UNITS.put(SensorType.TEMPERATURE, "C");
        UNITS.put(SensorType.PRESSURE, "bar");
        UNITS.put(SensorType.GAS_FLOW, "m3/h");
        UNITS.put(SensorType.METHANE, "%");
        UNITS.put(SensorType.CARBON_DIOXIDE, "%");
        UNITS.put(SensorType.HYDROGEN_SULFIDE, "ppm");
        UNITS.put(SensorType.AMMONIA, "ppm");
        UNITS.put(SensorType.HUMIDITY, "%");
        UNITS.put(SensorType.LIQUID_LEVEL, "%");
        UNITS.put(SensorType.PRESSURE_TRANSMITTER, "bar");
        UNITS.put(SensorType.FLOW_TRANSMITTER, "m3/h");
        UNITS.put(SensorType.TEMPERATURE_TRANSMITTER, "C");

        for (SensorType type : SensorType.values()) {
            READING_TYPES.put(type, ReadingType.GAUGE);
        }
        READING_TYPES.put(SensorType.GAS_FLOW, ReadingType.TOTALIZER);
        READING_TYPES.put(SensorType.FLOW_TRANSMITTER, ReadingType.TOTALIZER);
    }

    private PartnerMetricCatalog() {
    }

    public static String unitFor(SensorType type) {
        return UNITS.getOrDefault(type, "");
    }

    public static ReadingType readingTypeFor(SensorType type) {
        return READING_TYPES.getOrDefault(type, ReadingType.GAUGE);
    }

    public static String deviceIdFor(Long nodeId) {
        return "node_" + nodeId;
    }

    public static Long nodeIdFromDeviceId(String deviceId) {
        if (deviceId == null || !deviceId.startsWith("node_")) {
            return null;
        }
        try {
            return Long.parseLong(deviceId.substring(5));
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
