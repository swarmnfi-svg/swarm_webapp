/**
 * Deterministic Analysis narrative — universal reply shape for all modules.
 * Numbers only from factors / evidence; round floats; no raw tool dumps.
 */
import type {
  NovaAnalysisBundle,
  NovaAnalysisReason,
} from "@/lib/nova/analysis/factor-schema";
import type { NovaAnalysisDepth } from "@/lib/nova/analysis/depth";

/** Round for chat: one decimal for scores, strip long floats. */
export function formatAnalysisNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function cleanReason(text: string): string {
  return text
    .replace(/\b\d+\.\d{3,}\b/g, (m) => {
      const n = Number(m);
      return Number.isFinite(n) ? formatAnalysisNumber(n) : m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function polarityTag(p: NovaAnalysisReason["polarity"]): string {
  if (p === "hurts") return "**hurts**";
  if (p === "helps") return "**helps**";
  if (p === "context") return "context";
  return "neutral";
}

function domainTitle(domain: string): string {
  switch (domain) {
    case "kpi":
      return "KPI analysis";
    case "tasks":
      return "Tasks analysis";
    case "outstanding":
      return "Receivables analysis";
    case "attendance":
      return "Attendance analysis";
    case "project":
      return "Project analysis";
    default:
      return "Analysis";
  }
}

/**
 * KPI parameter history semantics (report-card SoT):
 * - ONTIME_TASKS / late OVERDUE completions: period history via completedAt
 *   (due June + finished late in July → July KPI).
 * - OVERDUE_TASKS also counts open backlog still past due at as-of
 *   (min(period end, now)); clearing open backlog recovers that part only.
 * - Self-assigned tasks are excluded from task KPI actuals (see `task-self-assigned.ts`).
 * Don’t imply “no open overdue = clean task KPI” when on-time is still low.
 */
function kpiHistoryNotes(
  bundle: NovaAnalysisBundle,
  reasons: NovaAnalysisReason[]
): string[] {
  if (bundle.domain !== "kpi") return [];
  const notes: string[] = [];
  const byCode = (code: string) =>
    bundle.factors.find(
      (f) =>
        f.id.toUpperCase().includes(code) ||
        f.label.toUpperCase().replace(/\s+/g, "_").includes(code)
    ) ||
    reasons.find(
      (r) =>
        r.factorId.toUpperCase().includes(code) ||
        r.label.toUpperCase().replace(/\s+/g, "_").includes(code)
    );

  const overdue = byCode("OVERDUE");
  const ontime = byCode("ONTIME") || byCode("ON_TIME") || byCode("ON-TIME");
  const overdueScore =
    overdue && "score" in overdue
      ? (overdue as { score?: number | null }).score
      : bundle.factors.find((f) => /overdue/i.test(f.id) || /overdue/i.test(f.label))
          ?.score;
  const ontimeScore =
    ontime && "score" in ontime
      ? (ontime as { score?: number | null }).score
      : bundle.factors.find((f) => /ontime|on[_-]?time/i.test(f.id) || /on[- ]?time/i.test(f.label))
          ?.score;

  if (
    overdueScore != null &&
    ontimeScore != null &&
    overdueScore >= 75 &&
    ontimeScore < 60
  ) {
    notes.push(
      "Open overdue backlog may look clean, but **on-time task** completion still hurts the period — late finishes are attributed by **completion month** (`completedAt`), not due month."
    );
  } else if (overdue && /overdue/i.test(String((overdue as { label?: string }).label ?? overdue))) {
    notes.push(
      "Overdue tasks combine **late completions in this period** (history via completedAt) with **still-open** past-due work at period as-of. Finishing late in July still counts in July even if the due date was June."
    );
  }
  if (ontimeScore != null && ontimeScore < 75) {
    notes.push(
      "On-time tasks are **period history**: late completions still drag the grade even after the work is done (completion month, not due month)."
    );
  }

  const hasTaskFactor = bundle.factors.some((f) =>
    /task|overdue|on[-_ ]?time|follow.?up/i.test(f.id + f.label)
  );
  if (hasTaskFactor) {
    notes.push(
      "Self-assigned tasks (you created or assigned to yourself) are excluded from KPI task metrics."
    );
  }

  const att = bundle.factors.find((f) => /attend|late|leave/i.test(f.id + f.label));
  if (att && att.polarity === "hurts") {
    notes.push(
      "Attendance / late / leave events from earlier in the period stay on the report card unless HR corrects the underlying rows."
    );
  }

  notes.push(
    "Report card values are the last Calculate snapshot; Approve does not freeze — only a **LOCKED** period freezes scores."
  );
  return notes.slice(0, 4);
}

/**
 * Universal polished narrative: Subject, Score/Position, Why (drivers),
 * Methodology, optional Detail / Recommendations.
 */
export function formatNovaAnalysisDeterministic(
  bundle: NovaAnalysisBundle,
  reasons: NovaAnalysisReason[]
): string {
  const depth: NovaAnalysisDepth = bundle.depth === "detail" ? "detail" : "summary";
  const lines: string[] = [];
  const title = domainTitle(bundle.domain);
  lines.push(`**${title} — ${bundle.subject.label}**`);
  lines.push("");

  const scoreTxt =
    bundle.position.value != null && typeof bundle.position.value === "number"
      ? formatAnalysisNumber(bundle.position.value)
      : bundle.position.value != null
        ? String(bundle.position.value)
        : null;
  const grade = bundle.position.band;
  const unit = bundle.position.unit ? ` ${bundle.position.unit}` : "";

  if (scoreTxt != null || grade) {
    lines.push(
      `**Score / position:** ${
        scoreTxt != null ? `**${scoreTxt}**${unit}` : "—"
      }${grade ? ` · **Grade:** **${grade}**` : ""}`
    );
  }
  if (bundle.periodLabel) {
    lines.push(`**Period:** ${bundle.periodLabel}`);
  }
  const headline = cleanReason(bundle.headline);
  if (headline) lines.push(`**Headline:** ${headline}`);

  if (!reasons.length) {
    lines.push("");
    lines.push("No scored factors were available to explain this position.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push(depth === "detail" ? "**Detail — how each factor contributes**" : "**Why (drivers)**");
  for (const r of reasons) {
    const f = bundle.factors.find((x) => x.id === r.factorId);
    const bits: string[] = [];
    if (f?.score != null) bits.push(`score **${formatAnalysisNumber(f.score)}**`);
    if (depth === "detail" && f?.weight != null) {
      bits.push(`weight **${formatAnalysisNumber(f.weight)}%**`);
    }
    if (depth === "detail" && f?.contribution != null) {
      bits.push(`contribution **${formatAnalysisNumber(f.contribution)}**`);
    }
    if (depth === "detail" && f?.actual != null) {
      bits.push(`actual **${formatAnalysisNumber(f.actual)}**`);
    }
    if (depth === "detail" && f?.target != null) {
      bits.push(`target **${formatAnalysisNumber(f.target)}**`);
    }
    const meta = bits.length ? ` (${bits.join(" · ")})` : "";
    lines.push(
      `${r.rank}. [${polarityTag(r.polarity)}] **${r.label}**${meta} — ${cleanReason(r.reason)}`
    );
  }

  const history = kpiHistoryNotes(bundle, reasons);
  if (history.length) {
    lines.push("");
    lines.push("**Period history notes**");
    for (const n of history) lines.push(`- ${n}`);
  }

  if (
    bundle.methodology &&
    !/no scoreable metrics/i.test(bundle.methodology) &&
    bundle.position.value != null
  ) {
    lines.push("");
    lines.push(`**Methodology:** ${cleanReason(bundle.methodology).slice(0, 360)}`);
  } else if (bundle.domain === "kpi" && scoreTxt != null) {
    lines.push("");
    lines.push(
      `**Methodology:** Overall score **${scoreTxt}**${
        grade ? ` (grade **${grade}**)` : ""
      } from this person's KPI report card (last Calculate snapshot).`
    );
  }

  const hurts = reasons.filter((r) => r.polarity === "hurts").slice(0, 3);
  if (hurts.length || bundle.links?.[0]?.href) {
    lines.push("");
    lines.push("**Recommendations**");
    for (const h of hurts) {
      lines.push(`- Focus on **${h.label}** — current drag on the result.`);
    }
    if (bundle.links?.[0]?.href) {
      lines.push(
        `- Open [${bundle.links[0].title}](${bundle.links[0].href}) for the full UI breakdown.`
      );
    }
  }

  return lines.join("\n");
}

