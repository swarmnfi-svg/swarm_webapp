package com.biopower.repository;

import com.biopower.model.entity.Report;
import com.biopower.model.enums.ReportType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ReportRepository extends JpaRepository<Report, Long> {
    List<Report> findByPlantIdOrderByCreatedAtDesc(Long plantId);
    List<Report> findByReportType(ReportType reportType);
}
