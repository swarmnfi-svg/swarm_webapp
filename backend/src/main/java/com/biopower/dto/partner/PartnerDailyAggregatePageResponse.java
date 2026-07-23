package com.biopower.dto.partner;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class PartnerDailyAggregatePageResponse {
    private List<PartnerDailyAggregateResponse> data;
}
