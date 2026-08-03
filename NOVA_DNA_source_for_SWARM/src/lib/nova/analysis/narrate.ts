/**
 * LLM narration for NOVA Analysis — synthesizes why values sit where they sit.
 * Hard rules: only use supplied factors; cite factorIds; digit-guard rejects invented numbers.
 * Soft-fail on 429 → facts-only + rate-limit tag.
 */
import { isNovaLlmConfigured, novaChatCompletion } from "@/lib/ai/llm";
import type {
  NovaAnalysisBundle,
  NovaAnalysisReason,
  NovaAnalysisResult,
} from "@/lib/nova/analysis/factor-schema";

export type NovaAnalysisLlmDriver = {
  factorId: string;
  role: "primary_drag" | "primary_boost" | "secondary" | "context";
  interpretation: string;
};

export type NovaAnalysisLlmPayload = {
  narrative: string;
  rankedDrivers: NovaAnalysisLlmDriver[];
  operationalNotes: string[];
};

/** Add exact + common rounded variants so LLM can say 40.6 for 40.64685…. */
function addDigitVariants(tokens: Set<string>, raw: string) {
  const cleaned = raw.replace(/,/g, "");
  tokens.add(cleaned);
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return;
  tokens.add(String(Math.round(n)));
  tokens.add(String(Math.round(n * 10) / 10));
  tokens.add(String(Math.round(n * 100) / 100));
  const one = (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
  tokens.add(one);
  const two = (Math.round(n * 100) / 100)
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
  if (two) tokens.add(two);
}

function collectAllowedDigitTokens(
  bundle: NovaAnalysisBundle,
  reasons: NovaAnalysisReason[],
  fallback: string
): Set<string> {
  const raw = [
    bundle.headline,
    String(bundle.position.value ?? ""),
    bundle.position.band ?? "",
    bundle.methodology ?? "",
    bundle.periodLabel ?? "",
    ...reasons.map((r) => `${r.factorId} ${r.label} ${r.reason} ${r.evidence.summary}`),
    ...bundle.factors.map(
      (f) =>
        `${f.id} ${f.label} ${f.reason} ${f.actual ?? ""} ${f.target ?? ""} ${f.score ?? ""} ${f.weight ?? ""} ${f.contribution ?? ""} ${f.evidence.summary}`
    ),
    fallback,
  ].join(" ");
  const tokens = new Set<string>();
  for (const m of raw.matchAll(/\d+(?:,\d{2,3})*(?:\.\d+)?/g)) {
    addDigitVariants(tokens, m[0]!);
  }
  return tokens;
}

/** Reject text that introduces numeric tokens not present in evidence. */
export function novaAnalysisNarrativeDigitGuard(
  narrative: string,
  allowed: Set<string>
): boolean {
  const found = [...narrative.matchAll(/\d+(?:,\d{2,3})*(?:\.\d+)?/g)].map((m) =>
    m[0]!.replace(/,/g, "")
  );
  return found.every((t) => allowed.has(t));
}

function allowedFactorIds(reasons: NovaAnalysisReason[]): Set<string> {
  return new Set(reasons.map((r) => r.factorId));
}

function parseLlmJson(raw: string): NovaAnalysisLlmPayload | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    const narrative = typeof obj.narrative === "string" ? obj.narrative.trim() : "";
    if (!narrative) return null;
    const rankedDrivers: NovaAnalysisLlmDriver[] = [];
    if (Array.isArray(obj.rankedDrivers)) {
      for (const row of obj.rankedDrivers.slice(0, 8)) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        if (typeof r.factorId !== "string" || typeof r.interpretation !== "string") continue;
        const role =
          r.role === "primary_drag" ||
          r.role === "primary_boost" ||
          r.role === "secondary" ||
          r.role === "context"
            ? r.role
            : "secondary";
        rankedDrivers.push({
          factorId: r.factorId,
          role,
          interpretation: r.interpretation.trim(),
        });
      }
    }
    const operationalNotes = Array.isArray(obj.operationalNotes)
      ? obj.operationalNotes
          .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
          .map((n) => n.trim())
          .slice(0, 4)
      : [];
    return { narrative, rankedDrivers, operationalNotes };
  } catch {
    return null;
  }
}

function formatPayloadForDisplay(payload: NovaAnalysisLlmPayload): string {
  const lines: string[] = [payload.narrative.trim()];
  if (payload.rankedDrivers.length) {
    lines.push("");
    lines.push("**Drivers (interpreted)**");
    for (const d of payload.rankedDrivers) {
      const role =
        d.role === "primary_drag"
          ? "hurts"
          : d.role === "primary_boost"
            ? "helps"
            : d.role === "context"
              ? "context"
              : "note";
      lines.push(`- [**${role}**] ${d.interpretation}`);
    }
  }
  if (payload.operationalNotes.length) {
    lines.push("");
    lines.push("**Recommendations**");
    for (const n of payload.operationalNotes) {
      lines.push(`- ${n}`);
    }
  }
  return lines.join("\n");
}

function validatePayload(
  payload: NovaAnalysisLlmPayload,
  reasons: NovaAnalysisReason[],
  allowedDigits: Set<string>
): boolean {
  const ids = allowedFactorIds(reasons);
  if (!novaAnalysisNarrativeDigitGuard(payload.narrative, allowedDigits)) return false;
  for (const d of payload.rankedDrivers) {
    if (!ids.has(d.factorId)) return false;
    if (!novaAnalysisNarrativeDigitGuard(d.interpretation, allowedDigits)) return false;
  }
  for (const n of payload.operationalNotes) {
    if (!novaAnalysisNarrativeDigitGuard(n, allowedDigits)) return false;
  }
  return true;
}

/**
 * Primary narration path for Analysis. Returns structured LLM synthesis when possible.
 */
export async function maybeNarrateNovaAnalysis(
  bundle: NovaAnalysisBundle,
  reasons: NovaAnalysisReason[],
  deterministicNarrative: string,
  opts?: { audience?: "director" | "staff" | "manager" }
): Promise<{
  text: string | null;
  payload: NovaAnalysisLlmPayload | null;
  source: NovaAnalysisResult["narrativeSource"];
}> {
  if (!reasons.length) {
    return { text: null, payload: null, source: "deterministic" };
  }
  if (!isNovaLlmConfigured()) {
    return { text: null, payload: null, source: "deterministic" };
  }

  const audience = opts?.audience ?? "manager";
  const tone =
    audience === "director"
      ? "Director tone: crisp, decision-oriented, no fluff."
      : audience === "staff"
        ? "Staff tone: clear, respectful, actionable for the person’s own metrics."
        : "Manager tone: clear coaching + ops clarity.";

  const factorPack = reasons
    .map((r) => {
      const f = bundle.factors.find((x) => x.id === r.factorId);
      return [
        `factorId=${r.factorId}`,
        `label=${r.label}`,
        `polarity=${r.polarity}`,
        `rank=${r.rank}`,
        f?.score != null ? `score=${f.score}` : null,
        f?.weight != null ? `weight=${f.weight}` : null,
        f?.actual != null ? `actual=${f.actual}` : null,
        f?.target != null ? `target=${f.target}` : null,
        f?.contribution != null ? `contribution=${f.contribution}` : null,
        `reason=${r.reason}`,
        `evidenceTool=${r.evidence.toolId}`,
        `evidenceSummary=${r.evidence.summary}`,
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");

  try {
    const res = await novaChatCompletion(
      [
        {
          role: "system",
          content:
            "You are NOVA Analysis for an ERP. You receive a FACT PACK only.\n" +
            "Tasks:\n" +
            "1) Synthesize why the headline value sits where it sits.\n" +
            "2) Rank likely drivers using ONLY supplied factorId values.\n" +
            "3) Suggest plausible operational interpretations (process/ops), labeled as interpretation — never as new ledger totals.\n" +
            `${tone}\n` +
            "HARD RULES:\n" +
            "- Do NOT invent numbers, ₹ amounts, %, scores, counts, or dates.\n" +
            "- Every number you write MUST already appear in the fact pack (rounding to 1 decimal is OK, e.g. 40.6 for 40.646…).\n" +
            "- Prefer polished sections: Score, Grade/Position, Drivers, Recommendations — markdown **bold** allowed.\n" +
            "- Do NOT paste raw tool dumps, factorId lists, or `_kpi_summary:` lines in narrative.\n" +
            "- Cite factorId only inside rankedDrivers.factorId fields — not in narrative prose.\n" +
            "- If the pack is thin, say so — do not speculate money.\n" +
            "- Reply with ONLY valid JSON matching:\n" +
            '{"narrative":"string","rankedDrivers":[{"factorId":"string","role":"primary_drag|primary_boost|secondary|context","interpretation":"string"}],"operationalNotes":["string"]}',
        },
        {
          role: "user",
          content:
            `Domain: ${bundle.domain}\n` +
            `Depth: ${bundle.depth === "detail" ? "detail" : "summary"}\n` +
            `Headline: ${bundle.headline}\n` +
            `Subject: ${bundle.subject.label} (${bundle.subject.kind})\n` +
            `Period: ${bundle.periodLabel ?? "—"}\n` +
            `Position: value=${bundle.position.value ?? "null"} unit=${bundle.position.unit ?? ""} band=${bundle.position.band ?? ""} stance=${bundle.position.stance ?? ""}\n` +
            `Methodology (fact): ${bundle.methodology ?? "—"}\n` +
            `FACT PACK (ranked reasons):\n${factorPack}\n` +
            `Deterministic scaffold (for reference — polish; keep the same numbers):\n${deterministicNarrative.slice(0, 1200)}`,
        },
      ],
      {
        maxTokens: 700,
        temperature: 0.25,
        dataClasses: ["ops_summary", "finance_money", "hr_pii", "hr_attendance"],
      }
    );

    const raw = (res.content ?? "").trim();
    if (!raw) return { text: null, payload: null, source: "deterministic" };

    const allowedDigits = collectAllowedDigitTokens(bundle, reasons, deterministicNarrative);
    const payload = parseLlmJson(raw);

    if (payload && validatePayload(payload, reasons, allowedDigits)) {
      return {
        text: formatPayloadForDisplay(payload),
        payload,
        source: "llm",
      };
    }

    // Fall back: treat whole reply as narrative if digit-safe and no forged factorIds needed
    if (
      !payload &&
      novaAnalysisNarrativeDigitGuard(raw, allowedDigits) &&
      raw.length < 1600 &&
      !raw.includes("{")
    ) {
      return { text: raw, payload: null, source: "llm" };
    }

    return { text: null, payload: null, source: "llm_rejected" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|rate.?limit/i.test(msg)) {
      return { text: null, payload: null, source: "llm_rate_limited" };
    }
    return { text: null, payload: null, source: "deterministic" };
  }
}
