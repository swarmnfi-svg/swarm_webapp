import { isNovaLlmConfigured } from "@/lib/ai/llm";

function envTrim(name: string): string {
  return (process.env[name] || "").trim();
}

/**
 * Kill-switches (either disables Reader):
 * - NOVA_READER_ENABLED=false
 * - INVOICE_OCR_ENABLED=false (legacy alias)
 */
export function isNovaReaderEnvEnabled(): boolean {
  if (envTrim("NOVA_READER_ENABLED") === "false") return false;
  if (envTrim("INVOICE_OCR_ENABLED") === "false") return false;
  return true;
}

export function isNovaReaderFeatureAvailable(opts: {
  aiAssistantEnabled: boolean;
}): boolean {
  return (
    isNovaReaderEnvEnabled() &&
    opts.aiAssistantEnabled &&
    isNovaLlmConfigured()
  );
}
