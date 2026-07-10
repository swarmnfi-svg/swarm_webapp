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

    @Value("${server.port:8080}")
    private int serverPort;

    public String resolveSwarmBaseUrl() {
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
                    "ESP cannot use localhost. Use your PC's LAN IP address instead.");
        }
    }
}
