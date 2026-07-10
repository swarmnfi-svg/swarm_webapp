package com.biopower.controller;

import com.biopower.dto.request.IoTBatchRequest;
import com.biopower.dto.request.IoTDataRequest;
import com.biopower.dto.response.ApiResponse;
import com.biopower.dto.response.SensorReadingResponse;
import com.biopower.service.IoTDataService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/iot")
@RequiredArgsConstructor
public class IoTController {

    private final IoTDataService iotDataService;

    @PostMapping("/data")
    public ResponseEntity<ApiResponse<SensorReadingResponse>> ingestData(
            @Valid @RequestBody IoTDataRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Data received", iotDataService.ingestData(request)));
    }

    @PostMapping("/batch")
    public ResponseEntity<ApiResponse<List<SensorReadingResponse>>> ingestBatch(
            @Valid @RequestBody IoTBatchRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Batch received", iotDataService.ingestBatch(request)));
    }
}
