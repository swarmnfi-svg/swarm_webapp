package com.biopower.util;

import com.biopower.model.enums.SensorType;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

public final class PlantSensorTypes {

    private PlantSensorTypes() {
    }

    public static String serialize(Set<SensorType> types) {
        if (types == null || types.isEmpty()) {
            return null;
        }
        return types.stream().map(Enum::name).collect(Collectors.joining(","));
    }

    public static Set<SensorType> parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return Collections.emptySet();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(SensorType::valueOf)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    public static List<SensorType> parseList(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        return values.stream()
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(SensorType::valueOf)
                .distinct()
                .collect(Collectors.toList());
    }
}
