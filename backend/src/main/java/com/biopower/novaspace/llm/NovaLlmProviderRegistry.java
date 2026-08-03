package com.biopower.novaspace.llm;

import com.biopower.novaspace.config.NovaSpaceOpProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds ordered provider chain: Groq keys → OpenRouter keys → Gemini keys (NOVA DNA failover).
 */
@Component
@Slf4j
public class NovaLlmProviderRegistry {

    private final List<NovaLlmSlot> slots;

    public NovaLlmProviderRegistry(Environment env, NovaSpaceOpProperties properties) {
        this.slots = buildSlots(env, properties);
        log.info("Nova LLM provider chain: {} slot(s) configured", slots.size());
    }

    public List<NovaLlmSlot> slots() {
        return slots;
    }

    public boolean isConfigured() {
        return !slots.isEmpty();
    }

    private static List<NovaLlmSlot> buildSlots(Environment env, NovaSpaceOpProperties properties) {
        List<NovaLlmSlot> out = new ArrayList<>();
        String groqModel = env.getProperty("NOVA_GROQ_MODEL", "llama-3.3-70b-versatile");
        String openRouterModel = env.getProperty("NOVA_OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct");
        String geminiModel = env.getProperty("NOVA_GEMINI_MODEL", "gemini-2.0-flash");

        addOpenAiSlots(out, "groq", NovaLlmProviderType.OPENAI_COMPAT,
                "https://api.groq.com/openai/v1", groqModel,
                env, "GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY_4");

        addOpenAiSlots(out, "openrouter", NovaLlmProviderType.OPENAI_COMPAT,
                "https://openrouter.ai/api/v1", openRouterModel,
                env, "OPENROUTER_API_KEY", "OPENROUTER_API_KEY_2",
                "OPENROUTER_API_KEY_3", "OPENROUTER_API_KEY_4");

        addGeminiSlots(out, geminiModel, env, "GEMINI_API_KEY", "GEMINI_API_KEY_2");

        if (out.isEmpty() && properties.getLlm().getApiKey() != null && !properties.getLlm().getApiKey().isBlank()) {
            out.add(NovaLlmSlot.builder()
                    .name("legacy-primary")
                    .type(NovaLlmProviderType.OPENAI_COMPAT)
                    .baseUrl(properties.getLlm().getBaseUrl())
                    .apiKey(properties.getLlm().getApiKey())
                    .model(properties.getLlm().getModel())
                    .build());
        }
        return out;
    }

    private static void addOpenAiSlots(List<NovaLlmSlot> out, String prefix, NovaLlmProviderType type,
            String baseUrl, String model, Environment env, String... keys) {
        int n = 0;
        for (String keyName : keys) {
            String key = trim(env.getProperty(keyName));
            if (key == null) {
                continue;
            }
            n++;
            out.add(NovaLlmSlot.builder()
                    .name(prefix + "-" + n)
                    .type(type)
                    .baseUrl(baseUrl)
                    .apiKey(key)
                    .model(model)
                    .build());
        }
    }

    private static void addGeminiSlots(List<NovaLlmSlot> out, String model, Environment env, String... keys) {
        int n = 0;
        for (String keyName : keys) {
            String key = trim(env.getProperty(keyName));
            if (key == null) {
                continue;
            }
            n++;
            out.add(NovaLlmSlot.builder()
                    .name("gemini-" + n)
                    .type(NovaLlmProviderType.GEMINI)
                    .baseUrl("https://generativelanguage.googleapis.com/v1beta")
                    .apiKey(key)
                    .model(model)
                    .build());
        }
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String t = value.trim();
        return t.isEmpty() ? null : t;
    }
}
