package com.biopower.dto.request;

import com.biopower.model.enums.ReportType;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ReportRequest {
    private Long plantId;
    @NotNull
    private ReportType reportType;
    private String format;
    private LocalDateTime startDate;
    private LocalDateTime endDate;
}
