package com.biopower.dto.request;

import lombok.Data;

@Data
public class EspStatusSnapshot {
    private DhtSnapshot dht;
    private Mq5Snapshot mq5;
    private Integer rssi;

    @Data
    public static class DhtSnapshot {
        private boolean ok;
        private Double temp;
        private Double humidity;
    }

    @Data
    public static class Mq5Snapshot {
        private boolean ok;
        private Double raw;
    }
}
