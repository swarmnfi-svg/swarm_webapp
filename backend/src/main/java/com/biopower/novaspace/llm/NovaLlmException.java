package com.biopower.novaspace.llm;

public class NovaLlmException extends RuntimeException {

    private final boolean retryable;

    public NovaLlmException(String message, boolean retryable) {
        super(message);
        this.retryable = retryable;
    }

    public NovaLlmException(String message, Throwable cause, boolean retryable) {
        super(message, cause);
        this.retryable = retryable;
    }

    public boolean isRetryable() {
        return retryable;
    }
}
