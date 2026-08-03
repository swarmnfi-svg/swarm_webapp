package com.biopower.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.util.Collections;

@Service
public class SwarmUrlService {

    @Value("${biopower.swarm.public-api-url:}")
    private String configuredPublicApiUrl;

    @Value("${server.port:8080}")
    private int serverPort;

    /**
     * URL the ESP hub POSTs to ({base}/iot/batch). Prefer explicit production config,
     * then Railway public domain, then developer LAN IP.
     */
    public String resolveSwarmBaseUrl() {
        if (configuredPublicApiUrl != null && !configuredPublicApiUrl.isBlank()) {
            return normalizeApiBase(configuredPublicApiUrl);
        }

        String railwayDomain = System.getenv("RAILWAY_PUBLIC_DOMAIN");
        if (railwayDomain != null && !railwayDomain.isBlank()) {
            return "https://" + railwayDomain.trim() + "/api";
        }

        try {
            for (NetworkInterface networkInterface : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!networkInterface.isUp() || networkInterface.isLoopback()) {
                    continue;
                }
                for (InetAddress address : Collections.list(networkInterface.getInetAddresses())) {
                    if (address instanceof Inet4Address && address.isSiteLocalAddress()) {
                        return "http://" + address.getHostAddress() + ":" + serverPort + "/api";
                    }
                }
            }
        } catch (SocketException ignored) {
        }
        return "http://localhost:" + serverPort + "/api";
    }

    public void validateEspReachableUrl(String url) {
        if (url == null || url.isBlank()) {
            throw new com.biopower.exception.BadRequestException("SWARM server URL is required");
        }
        String lower = url.toLowerCase();
        if (lower.contains("localhost") || lower.contains("127.0.0.1")) {
            throw new com.biopower.exception.BadRequestException(
                    "ESP cannot use localhost. Use your PC's LAN IP or the production SWARM API URL.");
        }
    }

    static String normalizeApiBase(String url) {
        String base = url.trim();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        if (!base.endsWith("/api")) {
            base = base + "/api";
        }
        return base;
    }
}
