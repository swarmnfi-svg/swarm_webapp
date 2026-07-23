package com.biopower.dto.partner;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;

@Data
@Builder
public class PartnerHistoryPageResponse {
    private List<PartnerReadingResponse> data;
    private String cursor;
    private boolean hasMore;
}
