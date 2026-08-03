package com.biopower.novaspace.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "biopower.nova-space-op")
public class NovaSpaceOpProperties {

    private boolean enabled = true;
    private Llm llm = new Llm();
    private Think think = new Think();
    private Narrate narrate = new Narrate();

    @Getter
    @Setter
    public static class Llm {
        private String baseUrl = "https://api.openai.com/v1";
        private String apiKey = "";
        private String model = "gpt-4o-mini";
    }

    @Getter
    @Setter
    public static class Think {
        private boolean enabled = true;
        private double confidenceThreshold = 0.65;
    }

    @Getter
    @Setter
    public static class Narrate {
        private boolean enabled = true;
    }

    public boolean isLlmConfigured() {
        return llm.getApiKey() != null && !llm.getApiKey().isBlank();
    }

    /** True when any multi-provider env key or legacy NOVA_LLM_API_KEY is set. */
    public boolean hasAnyProviderEnv() {
        return isLlmConfigured();
    }
}
