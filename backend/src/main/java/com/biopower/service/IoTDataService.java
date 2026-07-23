package com.biopower.service;

import com.biopower.dto.request.IoTBatchRequest;
import com.biopower.dto.request.IoTDataRequest;
import com.biopower.dto.response.SensorReadingResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.entity.SensorReading;
import com.biopower.model.enums.NodeStatus;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.repository.SensorReadingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class IoTDataService {

    private final SensorReadingRepository sensorReadingRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final AlertService alertService;
    private final AiHealthService aiHealthService;

    @Transactional
    public SensorReadingResponse ingestData(IoTDataRequest request) {
        SensorReadingResponse response = persistReading(request);
        aiHealthService.analyzePlant(request.getPlantId());
        return response;
    }

    private SensorReadingResponse persistReading(IoTDataRequest request) {
        SensorNode node = sensorNodeRepository.findByNodeIdAndPlantPlantId(request.getNodeId(), request.getPlantId())
                .orElseThrow(() -> new BadRequestException("Invalid plant/node combination"));
        if (request.getSensorType() != node.getSensorType()) {
            throw new BadRequestException("Sensor type does not match registered node: expected "
                    + node.getSensorType());
        }

        LocalDateTime recordedAt = request.getTimestamp() != null ? request.getTimestamp() : LocalDateTime.now();

        SensorReading reading = SensorReading.builder()
                .plantId(request.getPlantId())
                .nodeId(request.getNodeId())
                .sensorType(node.getSensorType())
                .value(request.getValue())
                .recordedAt(recordedAt)
                .build();

        reading = sensorReadingRepository.save(reading);

        node.setLastReadingAt(recordedAt);
        if (node.getStatus() == NodeStatus.OFFLINE) {
            node.setStatus(NodeStatus.ACTIVE);
        }
        sensorNodeRepository.save(node);

        alertService.evaluateReading(reading);

        return SensorReadingResponse.builder()
                .id(reading.getId())
                .plantId(reading.getPlantId())
                .nodeId(reading.getNodeId())
                .sensorType(reading.getSensorType())
                .value(reading.getValue())
                .recordedAt(reading.getRecordedAt())
                .build();
    }

    @Transactional
    public List<SensorReadingResponse> ingestBatch(IoTBatchRequest request) {
        List<SensorReadingResponse> responses = new ArrayList<>();
        Set<Long> updatedNodes = new HashSet<>();

        for (IoTBatchRequest.Reading item : request.getReadings()) {
            IoTDataRequest single = new IoTDataRequest();
            single.setPlantId(request.getPlantId());
            single.setNodeId(item.getNodeId());
            single.setSensorType(item.getSensorType());
            single.setValue(item.getValue());
            responses.add(persistReading(single));
            updatedNodes.add(item.getNodeId());
        }

        if (!responses.isEmpty()) {
            aiHealthService.analyzePlant(request.getPlantId());
        }

        if (request.getRssi() != null) {
            int signalPercent = rssiToPercent(request.getRssi());
            for (Long nodeId : updatedNodes) {
                sensorNodeRepository.findByNodeIdAndPlantPlantId(nodeId, request.getPlantId())
                        .ifPresent(node -> {
                            node.setSignalStrength(signalPercent);
                            sensorNodeRepository.save(node);
                        });
            }
        }

        return responses;
    }

    private int rssiToPercent(int rssi) {
        int percent = (int) ((rssi + 100) * 100.0 / 50.0);
        return Math.max(0, Math.min(100, percent));
    }
}
