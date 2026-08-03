/**
 * Provider routing by NOVA data class.
 * FINANCIAL / PERSONAL prefer local (custom) or allow-listed redacted-cloud hosts;
 * unapproved hosts are already blocked in assertSafeLlmBaseUrl.
 */

import type { NovaSkillDataClass } from "@/lib/nova/skills/skill-contract";
import type { NovaLlmProvider } from "@/lib/ai/llm";

/** Coarse sensitivity for provider filtering. */
export type NovaProviderSensitivity = "public" | "ops" | "financial" | "personal" | "admin";

const FINANCIAL_CLASSES = new Set<NovaSkillDataClass>(["finance_money"]);
const PERSONAL_CLASSES = new Set<NovaSkillDataClass>(["hr_pii", "hr_attendance"]);
const ADMIN_CLASSES = new Set<NovaSkillDataClass>(["system_admin", "documents"]);

/** Hosts approved for FINANCIAL / PERSONAL after fact redaction. */
const SENSITIVE_CLOUD_HOSTS = new Set([
  "api.groq.com",
  "generativelanguage.googleapis.com",
  "api.openai.com",
]);

function envTrim(name: string): string {
  return (process.env[name] || "").trim();
}

export function sensitivityFromDataClasses(
  dataClasses: readonly NovaSkillDataClass[]
): NovaProviderSensitivity {
  if (dataClasses.some((c) => PERSONAL_CLASSES.has(c))) return "personal";
  if (dataClasses.some((c) => FINANCIAL_CLASSES.has(c))) return "financial";
  if (dataClasses.some((c) => ADMIN_CLASSES.has(c))) return "admin";
  if (dataClasses.includes("ops_summary")) return "ops";
  return "public";
}

function providerHost(p: NovaLlmProvider): string {
  try {
    return new URL(p.baseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalPreferred(p: NovaLlmProvider): boolean {
  return p.id === "custom";
}

function isSensitiveCloudApproved(p: NovaLlmProvider): boolean {
  const host = providerHost(p);
  if (!host) return false;
  if (SENSITIVE_CLOUD_HOSTS.has(host)) return true;
  // Explicit override for staging / self-hosted allow-list expansion
  if (envTrim("NOVA_LLM_ALLOW_CLOUD_SENSITIVE") === "true") {
    return true;
  }
  return false;
}

/**
 * Filter ordered providers for the data-class sensitivity of this turn.
 * - public / ops: keep full allow-listed chain
 * - financial / personal: prefer custom (local), then approved redacted-cloud hosts;
 *   drop openrouter / together / fireworks free tiers unless override
 * - admin: same as financial (no free-tier scrapers)
 */
export function filterProvidersForSensitivity(
  providers: NovaLlmProvider[],
  sensitivity: NovaProviderSensitivity
): NovaLlmProvider[] {
  if (sensitivity === "public" || sensitivity === "ops") {
    return providers;
  }

  const local = providers.filter(isLocalPreferred);
  const approved = providers.filter((p) => !isLocalPreferred(p) && isSensitiveCloudApproved(p));
  const ordered = [...local, ...approved];

  // Never return empty when something was configured — fall back to approved-only
  // primary if local missing; if still empty, return original (caller may deterministic).
  if (ordered.length > 0) return ordered;
  return providers.filter(isSensitiveCloudApproved);
}

export function filterProvidersForDataClasses(
  providers: NovaLlmProvider[],
  dataClasses: readonly NovaSkillDataClass[]
): NovaLlmProvider[] {
  return filterProvidersForSensitivity(providers, sensitivityFromDataClasses(dataClasses));
}
