package com.biopower.model.entity;

import com.biopower.model.enums.ReportType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "reports")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Report {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "plant_id")
    private Long plantId;

    @Enumerated(EnumType.STRING)
    @Column(name = "report_type", nullable = false)
    private ReportType reportType;

    @Column(nullable = false)
    private String title;

    @Column(name = "file_path")
    private String filePath;

    @Column(name = "file_format")
    private String fileFormat;

    @Column(name = "generated_by")
    private Long generatedBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
