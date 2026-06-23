package com.biopower.service;

import com.biopower.dto.request.ReportRequest;
import com.biopower.model.entity.Report;
import com.biopower.model.enums.ReportType;
import com.biopower.repository.ReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ReportService {

    private final ReportRepository reportRepository;

    @Transactional(readOnly = true)
    public List<Report> getReports(Long plantId) {
        if (plantId != null) {
            return reportRepository.findByPlantIdOrderByCreatedAtDesc(plantId);
        }
        return reportRepository.findAll();
    }

    @Transactional
    public Report generateReport(ReportRequest request, Long userId) {
        String format = request.getFormat() != null ? request.getFormat() : "PDF";
        String title = buildTitle(request.getReportType(), request.getPlantId());

        Report report = Report.builder()
                .plantId(request.getPlantId())
                .reportType(request.getReportType())
                .title(title)
                .filePath("/reports/" + title.replace(" ", "_") + "." + format.toLowerCase())
                .fileFormat(format)
                .generatedBy(userId)
                .build();
        return reportRepository.save(report);
    }

    private String buildTitle(ReportType type, Long plantId) {
        String date = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmm"));
        return type.name() + "_Plant" + (plantId != null ? plantId : "ALL") + "_" + date;
    }
}
