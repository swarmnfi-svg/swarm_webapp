/**
 * Deterministic Trend chat formatting — summary + ranking + optional sparkline.
 * Digit tokens in narrative come only from rankings/series/window.
 */
import type { NovaTrendBundle, NovaTrendResult } from "@/lib/nova/trend/contract";
import { sparklineFromSeries } from "@/lib/nova/trend/rank";
import { novaAnalysisNarrativeDigitGuard } from "@/lib/nova/analysis/narrate";

function domainTitle(domain: string): string {
  switch (domain) {
    case "attendance_late":
      return "Attendance late trend";
    case "task_late_completion":
      return "Task late-completion trend";
    case "ar_aging":
      return "AR aging trend";
    case "staff_expense_spend":
      return "Staff expense spend trend";
    case "kpi_score":
      return "KPI score trend";
    default:
      return "Trend";
  }
}

function addDigitVariants(tokens: Set<string>, raw: string) {
  const cleaned = raw.replace(/,/g, "");
  tokens.add(cleaned);
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return;
  tokens.add(String(Math.round(n)));
}

function collectAllowedDigits(bundle: NovaTrendBundle, summary: string, table: string): Set<string> {
  const raw = [
    bundle.window.label,
    bundle.metric.label,
    bundle.entity.label,
    summary,
    table,
    ...bundle.rankings.map((r) => `${r.rank} ${r.value} ${r.label} ${r.secondary ?? ""}`),
    ...bundle.series.map((s) => `${s.bucket} ${s.value}`),
  ].join(" ");
  const tokens = new Set<string>();
  for (const m of raw.matchAll(/\d+(?:,\d{2,3})*(?:\.\d+)?/g)) {
    addDigitVariants(tokens, m[0]!);
  }
  return tokens;
}

function rankingEntityColumn(bundle: NovaTrendBundle): string {
  if (bundle.domain === "ar_aging" || bundle.entity.kind === "party") return "Customer";
  if (bundle.domain === "kpi_score" || bundle.entity.kind === "person") return "Person";
  if (bundle.domain === "staff_expense_spend") return "Staff";
  return "Entity";
}

function rankingNoun(bundle: NovaTrendBundle): { one: string; many: string } {
  if (bundle.domain === "ar_aging" || bundle.entity.kind === "party") {
    return { one: "customer", many: "customers" };
  }
  if (bundle.domain === "staff_expense_spend") {
    return { one: "staff member", many: "staff members" };
  }
  return { one: "person", many: "people" };
}

function formatRankingTable(bundle: NovaTrendBundle): string {
  if (!bundle.rankings.length) return "";
  const col = bundle.metric.label;
  const entityCol = rankingEntityColumn(bundle);
  const lines = [
    `| # | ${entityCol} | ${col} |`,
    `|---|${"-".repeat(Math.max(3, entityCol.length))}|${"-".repeat(Math.max(3, col.length))}|`,
  ];
  for (const r of bundle.rankings) {
    const extra = r.secondary ? ` (${r.secondary})` : "";
    lines.push(`| ${r.rank} | ${r.label}${extra} | ${r.value} |`);
  }
  return lines.join("\n");
}

export function formatNovaTrendDeterministic(bundle: NovaTrendBundle): NovaTrendResult {
  if (bundle.empty) {
    const msg = bundle.message?.trim() || "Nothing to chart for this window.";
    const narrative = `**${domainTitle(bundle.domain)}** (${bundle.window.label})\n${msg}`;
    return {
      ...bundle,
      summary: msg,
      findingsFormatted: "",
      primaryNarrative: narrative,
    };
  }

  const people = bundle.rankings.length;
  const total = bundle.rankings.reduce((s, r) => s + r.value, 0);
  const top = bundle.rankings[0];
  const noun = rankingNoun(bundle);
  const summaryParts: string[] = [];
  if (people === 0) {
    summaryParts.push(`No ${bundle.metric.label.toLowerCase()} in this window.`);
  } else {
    summaryParts.push(
      `${people} ${people === 1 ? noun.one : noun.many} · ${total} ${bundle.metric.unit} total.`
    );
    if (top) {
      summaryParts.push(`Most: ${top.label} (${top.value}).`);
    }
  }
  const summary = summaryParts.join(" ");

  const table = formatRankingTable(bundle);
  const spark = sparklineFromSeries(bundle.series);
  const findings: string[] = [];
  if (table) findings.push(table);
  if (spark) findings.push(`Series (${bundle.grain}): ${spark}`);
  const findingsFormatted = findings.join("\n\n");

  const primaryNarrative = [
    `**${domainTitle(bundle.domain)}** (${bundle.window.label})`,
    summary,
    findingsFormatted,
    bundle.methodology ? `_${bundle.methodology}_` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const allowed = collectAllowedDigits(bundle, summary, table);
  if (!novaAnalysisNarrativeDigitGuard(primaryNarrative, allowed)) {
    const safe = [
      `**${domainTitle(bundle.domain)}** (${bundle.window.label})`,
      summary,
      table,
    ]
      .filter(Boolean)
      .join("\n\n");
    return {
      ...bundle,
      summary,
      findingsFormatted: table,
      primaryNarrative: safe,
    };
  }

  return {
    ...bundle,
    summary,
    findingsFormatted,
    primaryNarrative,
  };
}
