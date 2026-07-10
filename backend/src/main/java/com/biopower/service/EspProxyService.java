package com.biopower.service;

import com.biopower.exception.BadRequestException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.InetAddress;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class EspProxyService {

    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SwarmUrlService swarmUrlService;

    public String fetchInfo(String ip) {
        return get(ip, "/info", null);
    }

    public String fetchStatus(String ip, String password) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Device-Password", password != null ? password.trim() : "");
        return exchange(ip, "/api/status", HttpMethod.GET, headers, null);
    }

    public String configure(String ip, String password, Map<String, Object> body) {
        Object swarmUrl = body.get("swarmUrl");
        if (swarmUrl != null) {
            swarmUrlService.validateEspReachableUrl(String.valueOf(swarmUrl));
        }
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Device-Password", password != null ? password.trim() : "");
        headers.setContentType(MediaType.APPLICATION_JSON);
        try {
            String jsonBody = objectMapper.writeValueAsString(body);
            return exchange(ip, "/swarm/configure", HttpMethod.POST, headers, jsonBody);
        } catch (JsonProcessingException e) {
            throw new BadRequestException("Invalid configure payload");
        }
    }

    public JsonNode parseJson(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (JsonProcessingException e) {
            throw new BadRequestException("Invalid ESP response");
        }
    }

    private String get(String ip, String path, HttpHeaders headers) {
        return exchange(ip, path, HttpMethod.GET, headers, null);
    }

    private String exchange(String ip, String path, HttpMethod method, HttpHeaders headers, Object body) {
        validateIp(ip);
        String url = "http://" + ip.trim() + path;
        try {
            HttpEntity<Object> entity = new HttpEntity<>(body, headers);
            ResponseEntity<String> response = restTemplate.exchange(url, method, entity, String.class);
            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }
            throw new BadRequestException("ESP returned status " + response.getStatusCode().value());
        } catch (HttpStatusCodeException e) {
            if (e.getStatusCode().value() == 401) {
                throw new BadRequestException("Wrong device password");
            }
            String details = e.getResponseBodyAsString();
            if (details != null && !details.isBlank()) {
                throw new BadRequestException("ESP returned status " + e.getStatusCode().value() + ": " + details);
            }
            throw new BadRequestException("ESP returned status " + e.getStatusCode().value());
        } catch (RestClientException e) {
            throw new BadRequestException("Cannot reach ESP at " + ip + ". Check it is on and on same Wi-Fi.");
        }
    }

    private void validateIp(String ip) {
        if (ip == null || ip.isBlank()) {
            throw new BadRequestException("Invalid ESP IP address");
        }
        try {
            InetAddress address = InetAddress.getByName(ip.trim());
            if (!(address.isSiteLocalAddress() || address.isLoopbackAddress())) {
                throw new BadRequestException("Invalid ESP IP address");
            }
        } catch (Exception e) {
            throw new BadRequestException("Invalid ESP IP address");
        }
    }
}
