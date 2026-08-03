# NOVA Gemini Key Failover

NOVA supports three ordered Gemini API key slots for text answers and Reader vision/OCR:

1. `GEMINI_API_KEY`
2. `GEMINI_API_KEY_2`
3. `GEMINI_API_KEY_3`

The primary key is tried first. On retryable Gemini/provider failures such as rate limits, quota responses, 5xx, empty responses, timeouts, aborts, or network failures, NOVA moves to the next configured numbered key. User/business validation errors are not retried as LLM failover.

If `NOVA_LLM_PROVIDERS` is set and includes `gemini`, NOVA expands that entry to all configured numbered Gemini slots in order: `gemini`, `gemini2`, then `gemini3`.

## Local Setup

Put keys only in your local ignored env file, never in git:

```bash
GEMINI_API_KEY="<primary key>"
GEMINI_API_KEY_2="<second failover key>"
GEMINI_API_KEY_3="<third failover key>"
```

Do not commit `.env`, shell history containing real keys, screenshots of keys, or copied Railway variable exports.

## Railway Setup

In Railway, set the variables on the production app service:

- `GEMINI_API_KEY`
- `GEMINI_API_KEY_2`
- `GEMINI_API_KEY_3`

Use the Railway dashboard variable editor or another approved secret-management path. Do not paste actual key values into chat, issue comments, commits, logs, or PR descriptions.

## Logging

NOVA logs only provider slot labels such as `gemini`, `gemini2`, and `gemini3`. It does not log API key values or provider response bodies.
