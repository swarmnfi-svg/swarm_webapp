package com.biopower.novaspace.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class NovaLlmClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(45);

    private final NovaLlmProviderRegistry registry;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(TIMEOUT)
            .build();

    public boolean isConfigured() {
        return registry.isConfigured();
    }

    public Optional<String> complete(String systemPrompt, String userPrompt) {
        if (!registry.isConfigured()) {
            return Optional.empty();
        }
        List<NovaLlmMessage> messages = List.of(
                new NovaLlmMessage("system", systemPrompt),
                new NovaLlmMessage("user", userPrompt)
        );
        for (NovaLlmSlot slot : registry.slots()) {
            try {
                String text = callSlot(slot, messages);
                if (text != null && !text.isBlank()) {
                    log.debug("Nova LLM response from {}", slot.name());
                    return Optional.of(text.trim());
                }
            } catch (NovaLlmException ex) {
                log.warn("Nova LLM slot {} failed: {}", slot.name(), ex.getMessage());
                if (!ex.isRetryable()) {
                    break;
                }
            }
        }
        return Optional.empty();
    }

    private String callSlot(NovaLlmSlot slot, List<NovaLlmMessage> messages) {
        return switch (slot.type()) {
            case OPENAI_COMPAT -> callOpenAiCompatible(slot, messages);
            case GEMINI -> callGemini(slot, messages);
        };
    }

    private String callOpenAiCompatible(NovaLlmSlot slot, List<NovaLlmMessage> messages) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("model", slot.model());
            body.put("temperature", 0.2);
            body.put("max_tokens", 800);
            body.put("messages", messages.stream()
                    .map(m -> Map.of("role", m.role(), "content", m.content()))
                    .toList());

            HttpRequest.Builder req = HttpRequest.newBuilder()
                    .uri(URI.create(slot.baseUrl().replaceAll("/$", "") + "/chat/completions"))
                    .timeout(TIMEOUT)
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + slot.apiKey())
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));

            if (slot.name().startsWith("openrouter")) {
                req.header("HTTP-Referer", "https://app.swarm.co.in");
                req.header("X-Title", "SWARM Nova Space OP");
            }

            HttpResponse<String> response = httpClient.send(req.build(), HttpResponse.BodyHandlers.ofString());
            int code = response.statusCode();
            if (code == 429 || code == 502 || code == 503 || code == 504) {
                throw new NovaLlmException("HTTP " + code, true);
            }
            if (code < 200 || code >= 300) {
                throw new NovaLlmException("HTTP " + code + ": " + truncate(response.body()), true);
            }

            JsonNode root = objectMapper.readTree(response.body());
            JsonNode content = root.path("choices").path(0).path("message").path("content");
            if (content.isMissingNode() || content.isNull()) {
                throw new NovaLlmException("Empty completion body", true);
            }
            return content.asText();
        } catch (NovaLlmException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new NovaLlmException(ex.getMessage(), ex, true);
        }
    }

    private String callGemini(NovaLlmSlot slot, List<NovaLlmMessage> messages) {
        try {
            String combined = messages.stream()
                    .map(m -> m.role().toUpperCase() + ": " + m.content())
                    .reduce((a, b) -> a + "\n\n" + b)
                    .orElse("");

            Map<String, Object> body = Map.of(
                    "contents", List.of(Map.of(
                            "parts", List.of(Map.of("text", combined))
                    )),
                    "generationConfig", Map.of(
                            "temperature", 0.2,
                            "maxOutputTokens", 800
                    )
            );

            String url = slot.baseUrl().replaceAll("/$", "")
                    + "/models/" + slot.model() + ":generateContent?key=" + slot.apiKey();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(TIMEOUT)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int code = response.statusCode();
            if (code == 429 || code == 502 || code == 503 || code == 504) {
                throw new NovaLlmException("Gemini HTTP " + code, true);
            }
            if (code < 200 || code >= 300) {
                throw new NovaLlmException("Gemini HTTP " + code + ": " + truncate(response.body()), true);
            }

            JsonNode root = objectMapper.readTree(response.body());
            JsonNode text = root.path("candidates").path(0).path("content").path("parts").path(0).path("text");
            if (text.isMissingNode() || text.isNull()) {
                throw new NovaLlmException("Empty Gemini body", true);
            }
            return text.asText();
        } catch (NovaLlmException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new NovaLlmException(ex.getMessage(), ex, true);
        }
    }

    private static String truncate(String body) {
        if (body == null) {
            return "";
        }
        return body.length() > 200 ? body.substring(0, 200) + "..." : body;
    }
}
