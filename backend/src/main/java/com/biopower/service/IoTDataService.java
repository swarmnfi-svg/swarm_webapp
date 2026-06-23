package com.biopower.service;

import com.biopower.dto.request.IoTDataRequest;
import com.biopower.dto.response.SensorReadingResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.entity.SensorReading;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.repository.SensorReadingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class IoTDataService {

    private final SensorReadingRepository sensorReadingRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final AlertService alertService;
    private final AiHealthService aiHealthService;

    @Transactional
    public SensorReadingResponse ingestData(IoTDataRequest request) {
        SensorNode node = sensorNodeRepository.findByNodeIdAndPlantPlantId(request.getNodeId(), request.getPlantId())
                .orElseThrow(() -> new BadRequestException("Invalid plant/node combination"));

        LocalDateTime recordedAt = request.getTimestamp() != null ? request.getTimestamp() : LocalDateTime.now();

        SensorReading reading = SensorReading.builder()
                .plantId(request.getPlantId())
                .nodeId(request.getNodeId())
                .sensorType(request.getSensorType())
                .value(request.getValue())
                .recordedAt(recordedAt)
                .build();

        reading = sensorReadingRepository.save(reading);

        node.setLastReadingAt(recordedAt);
        sensorNodeRepository.save(node);

        alertService.evaluateReading(reading);
        aiHealthService.analyzePlant(request.getPlantId());

        return SensorReadingResponse.builder()
                .id(reading.getId())
                .plantId(reading.getPlantId())
                .nodeId(reading.getNodeId())
                .sensorType(reading.getSensorType())
                .value(reading.getValue())
                .recordedAt(reading.getRecordedAt())
                .build();
    }
}
