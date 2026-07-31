package com.biopower.repository;

import com.biopower.model.entity.Report;
import com.biopower.model.enums.ReportType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ReportRepository extends JpaRepository<Report, Long> {
    List<Report> findByPlantIdOrderByCreatedAtDesc(Long plantId);
    List<Report> findByReportType(ReportType reportType);

    @Modifying
    @Query("DELETE FROM Report r WHERE r.plantId = :plantId")
    void deleteByPlantId(@Param("plantId") Long plantId);
}
