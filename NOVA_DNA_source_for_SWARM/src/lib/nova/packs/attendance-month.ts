/**
 * Attendance Month pack — savable HR month overview (≤3 attentions).
 * Catalog skills only; no invented punches / silent-month theatre.
 */

import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolFact, NovaToolLink } from "@/lib/nova/core/tool-types";
import { buildNovaFinding, formatNovaFindings, type NovaFinding } from "@/lib/nova/recipes/finding";
import {
  assertRecipeContract,
  filterRecipeToolsForUser,
  type NovaRecipe,
} from "@/lib/nova/recipes/recipe-contract";
import {
  DAILY_BRIEF_FANOUT_CONCURRENCY,
  mapWithConcurrency,
} from "@/lib/nova/skills/ops/daily-brief";
import {
  buildNovaPackResult,
  selectNovaPackAttentions,
  type NovaPackMetricRef,
  type NovaPackResult,
  type NovaPackWarning,
} from "@/lib/nova/pack-result";
import { NOVA_MONTH_ATTENTION_PRIMARY_MAX } from "@/lib/nova/invariants";
import { novaCurrentMonthRange } from "@/lib/ai/nova-dates";
import {
  ATTENDANCE_MONTH_CHAPTER_TOOLS,
  ATTENDANCE_MONTH_METRIC_IDS,
  ATTENDANCE_MONTH_PACK_ID,
} from "@/lib/nova/packs/attendance-month-prep";

export const ATTENDANCE_MONTH_PACK_VERSION = "1.0.0";

export const ATTENDANCE_MONTH_RECIPE: NovaRecipe = {
  id: ATTENDANCE_MONTH_PACK_ID,
  label: "Attendance Month",
  description:
    "Calendar-month attendance overview: present / late / absent + optional leave/reg — facts only.",
  toolIds: [...ATTENDANCE_MONTH_CHAPTER_TOOLS],
  readOnly: true,
  maximumSteps: 4,
  examples: [
    "how is this month's attendance?",
    "how is this month attendance",
    "attendance this month",
  ],
};

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function slimErrorNote(toolId: string, fact: NovaToolFact): string | null {
  if (fact.denied) return `Omitted ${toolId} (permission).`;
  if (!fact.ok) return `Omitted ${toolId} (${fact.error ?? "failed"}).`;
  return null;
}

function isMaterial(f: NovaFinding): boolean {
  const o = f.observation.toLowerCase();
  if (/no material attendance|needs an explicit calendar month/i.test(o)) {
    return /needs an explicit/.test(o);
  }
  return /late|absent|pending leave|pending regularisation|pending overtime|top late/i.test(o);
}

function draftMetrics(
  periodLabel: string,
  values: Record<string, number | string | null>
): NovaPackMetricRef[] {
  return ATTENDANCE_MONTH_METRIC_IDS.map((metricId) => ({
    metricId,
    version: "1",
    certification: "draft" as const,
    value: values[metricId] ?? null,
    display:
      values[metricId] == null
        ? undefined
        : typeof values[metricId] === "number"
          ? String(values[metricId])
          : String(values[metricId]),
    periodLabel,
  }));
}

function buildFindings(facts: NovaToolFact[], periodLabel: string): NovaFinding[] {
  const out: NovaFinding[] = [];
  const att = facts.find((f) => f.tool === "attendance_late_summary" && f.ok);
  const leave = facts.find((f) => f.tool === "leave_summary" && f.ok);
  const reg = facts.find((f) => f.tool === "regularisation_summary" && f.ok);
  const ot = facts.find((f) => f.tool === "overtime_summary" && f.ok);

  if (!att) {
    out.push(
      buildNovaFinding({
        observation:
          "Attendance Month needs an explicit calendar month (e.g. this month / July) — I will not invent a silent month or punch theatre.",
        evidence: [{ toolId: "attendance_late_summary", summary: "missing or denied" }],
        contributors: [{ toolId: "attendance_late_summary", role: "gap" }],
        recommendation: { label: "Attendance register", href: "/attendance-hr/register" },
        confidence: "fact",
      })
    );
    return out;
  }

  const d = (att.data ?? {}) as Record<string, unknown>;
  const presentDays = n(d.presentPunchDays ?? d.presentDays);
  const lateCount = n(d.lateDayCount ?? d.latePeopleCount ?? d.peopleWithLate);
  const absentDays = n(d.absentDays);
  const topLate = Array.isArray(d.topLateComers) ? d.topLateComers : [];

  out.push(
    buildNovaFinding({
      observation: `${periodLabel}: present ${presentDays}, late ${lateCount}, absent ${absentDays} (register facts only).`,
      evidence: [
        {
          toolId: "attendance_late_summary",
          summary: `present=${presentDays}; late=${lateCount}; absent=${absentDays}`,
        },
      ],
      contributors: [{ toolId: "attendance_late_summary", role: "overview" }],
      recommendation: { label: "My attendance", href: "/attendance-hr/my-attendance" },
      confidence: "fact",
    })
  );

  if (lateCount > 0) {
    out.push(
      buildNovaFinding({
        observation: `${lateCount} late day(s) / late comer(s) in ${periodLabel}.`,
        evidence: [{ toolId: "attendance_late_summary", summary: `late=${lateCount}` }],
        contributors: [{ toolId: "attendance_late_summary", role: "late" }],
        recommendation: { label: "Exceptions", href: "/attendance-hr/exceptions" },
        confidence: "fact",
      })
    );
  }

  if (absentDays > 0) {
    out.push(
      buildNovaFinding({
        observation: `${absentDays} absent register day(s) in ${periodLabel} (MISSING_PUNCH_IN / unpaid leave — no invented no-shows for month overview).`,
        evidence: [{ toolId: "attendance_late_summary", summary: `absent=${absentDays}` }],
        contributors: [{ toolId: "attendance_late_summary", role: "absent" }],
        recommendation: { label: "Register", href: "/attendance-hr/register" },
        confidence: "fact",
      })
    );
  }

  if (topLate.length > 0) {
    const names = topLate
      .slice(0, 3)
      .map((p) => {
        const row = p as Record<string, unknown>;
        return String(row.name ?? row.code ?? "—");
      })
      .join("; ");
    const overflow = Math.max(0, topLate.length - 3);
    out.push(
      buildNovaFinding({
        observation: `Top late (≤3): ${names}.${overflow ? ` Overflow: ${overflow}.` : ""}`,
        evidence: [{ toolId: "attendance_late_summary", summary: `topLate=${topLate.length}` }],
        contributors: [{ toolId: "attendance_late_summary", role: "top late" }],
        recommendation: { label: "Register", href: "/attendance-hr/register" },
        confidence: "supported_inference",
      })
    );
  }

  if (leave?.data) {
    const pending = n((leave.data as Record<string, unknown>).pendingCount);
    if (pending > 0) {
      out.push(
        buildNovaFinding({
          observation: `Pending leave in scope: ${pending}.`,
          evidence: [{ toolId: "leave_summary", summary: `pending=${pending}` }],
          contributors: [{ toolId: "leave_summary", role: "leave" }],
          recommendation: { label: "Leave", href: "/attendance-hr/leave" },
          confidence: "fact",
        })
      );
    }
  }

  if (reg?.data) {
    const pending = n(
      (reg.data as Record<string, unknown>).pendingCount ??
        (reg.data as Record<string, unknown>).pending
    );
    if (pending > 0) {
      out.push(
        buildNovaFinding({
          observation: `Pending regularisation: ${pending}.`,
          evidence: [{ toolId: "regularisation_summary", summary: `pending=${pending}` }],
          contributors: [{ toolId: "regularisation_summary", role: "regularisation" }],
          recommendation: { label: "Regularisation", href: "/attendance-hr/regularisation" },
          confidence: "fact",
        })
      );
    }
  }

  if (ot?.data) {
    const pending = n(
      (ot.data as Record<string, unknown>).pendingCount ??
        (ot.data as Record<string, unknown>).pending
    );
    if (pending > 0) {
      out.push(
        buildNovaFinding({
          observation: `Pending overtime approvals: ${pending}.`,
          evidence: [{ toolId: "overtime_summary", summary: `pending=${pending}` }],
          contributors: [{ toolId: "overtime_summary", role: "overtime" }],
          recommendation: { label: "Overtime", href: "/attendance-hr/overtime" },
          confidence: "fact",
        })
      );
    }
  }

  return out;
}

export async function runAttendanceMonthPack(
  ctx: NovaSkillHandlerContext
): Promise<{ pack: NovaPackResult }> {
  const errors = assertRecipeContract(ATTENDANCE_MONTH_RECIPE);
  if (errors.length) throw new Error(errors.join("; "));

  // Pack signature is month — never silent day default.
  const range = ctx.range ?? novaCurrentMonthRange(new Date(), ctx.tz);
  const packCtx: NovaSkillHandlerContext = { ...ctx, range };
  const periodLabel = range.label || "this month";

  const runnable = filterRecipeToolsForUser(packCtx.user, ATTENDANCE_MONTH_RECIPE);
  const omittedNotes: string[] = [];
  for (const t of ATTENDANCE_MONTH_RECIPE.toolIds) {
    if (!runnable.includes(t)) omittedNotes.push(`Omitted ${t} (permission).`);
  }

  const facts: NovaToolFact[] = [];
  const links: NovaToolLink[] = [];
  const results = await mapWithConcurrency(
    runnable,
    DAILY_BRIEF_FANOUT_CONCURRENCY,
    async (toolId) => {
      const { dispatchNovaSkill } = await import("@/lib/nova/skills/registry");
      // Prefer overview focus for month pack (not late-only).
      const query =
        toolId === "attendance_late_summary"
          ? `attendance overview ${periodLabel}`
          : packCtx.query;
      return dispatchNovaSkill(toolId, { ...packCtx, query });
    }
  );
  for (let i = 0; i < runnable.length; i++) {
    const res = results[i];
    if (!res) {
      omittedNotes.push(`Omitted ${runnable[i]} (dispatch failed).`);
      continue;
    }
    facts.push(res.fact);
    if (res.links) links.push(...res.links);
    const note = slimErrorNote(runnable[i], res.fact);
    if (note) omittedNotes.push(note);
  }

  const findings = buildFindings(facts, periodLabel);
  const attentions = selectNovaPackAttentions(
    findings.filter(isMaterial),
    NOVA_MONTH_ATTENTION_PRIMARY_MAX
  );
  const warnings: NovaPackWarning[] = omittedNotes
    .filter((n) => /permission/i.test(n))
    .map((message) => ({ code: "permission_omission" as const, message }));
  warnings.push({
    code: "freshness",
    message: "Live HR register reads at dataAsOf — save a report for an immutable snapshot.",
  });

  const att = facts.find((f) => f.tool === "attendance_late_summary" && f.ok)?.data as
    | Record<string, unknown>
    | undefined;
  const metrics = draftMetrics(periodLabel, {
    "attendance.period_overview": periodLabel,
    "attendance.late_count": att ? n(att.lateDayCount ?? att.latePeopleCount) : null,
    "attendance.present_days": att ? n(att.presentPunchDays) : null,
    "attendance.absent_days": att ? n(att.absentDays) : null,
    "attendance.top_late": att && Array.isArray(att.topLateComers) ? att.topLateComers.length : null,
    "leave.summary": facts.find((f) => f.tool === "leave_summary" && f.ok)
      ? n((facts.find((f) => f.tool === "leave_summary" && f.ok)!.data as Record<string, unknown>).pendingCount)
      : null,
    "regularisation.pending": null,
    "overtime.pending": null,
  });

  const pack = buildNovaPackResult({
    packId: ATTENDANCE_MONTH_PACK_ID,
    packVersion: ATTENDANCE_MONTH_PACK_VERSION,
    period: {
      label: periodLabel,
      grain: "month",
      calendarKind: "calendar_month",
      source: ctx.range ? "explicit" : "default",
    },
    dataAsOf: new Date().toISOString(),
    metrics,
    facts,
    findings,
    attentions,
    charts: [
      {
        bindingId: "kpi_strip",
        metricIds: [
          "attendance.present_days",
          "attendance.late_count",
          "attendance.absent_days",
        ],
        title: `Attendance — ${periodLabel}`,
        points: [
          { label: "Present", value: n(att?.presentPunchDays), unit: "count" },
          { label: "Late", value: n(att?.lateDayCount ?? att?.latePeopleCount), unit: "count" },
          { label: "Absent", value: n(att?.absentDays), unit: "count" },
        ],
      },
      {
        bindingId: "ageing_or_attention",
        metricIds: ["attendance.top_late"],
        title: "Late attention",
        points: attentions.primary.map((a, i) => ({
          label: `Attention ${i + 1}`,
          value: 1,
          unit: "count",
        })),
      },
    ],
    links,
    warnings,
    omittedNotes,
    narrativeHints: [
      `Attendance Month for ${periodLabel}.`,
      ...attentions.primary.map((a) => a.observation),
      ...(attentions.primary.length === 0
        ? [`No material attendance attentions for ${periodLabel}.`]
        : []),
    ],
  });
  return { pack };
}

export function formatAttendanceMonthAnswer(pack: NovaPackResult): string {
  const parts = ["**Attendance Month**", ...pack.narrativeHints];
  const f = formatNovaFindings(pack.findings);
  if (f) parts.push(f);
  if (pack.attentions.overflowCount > 0) {
    parts.push(`_…and ${pack.attentions.overflowCount} more attentions._`);
  }
  if (pack.omittedNotes.length) parts.push("_Notes:_ " + pack.omittedNotes.join(" "));
  return parts.join("\n\n");
}

export async function runAttendanceMonthRecipe(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { pack } = await runAttendanceMonthPack(ctx);
  return {
    fact: {
      tool: ATTENDANCE_MONTH_PACK_ID,
      ok: true,
      data: {
        packId: pack.packId,
        packVersion: pack.packVersion,
        attentionCount: pack.attentions.primary.length,
        overflowCount: pack.attentions.overflowCount,
        narrative: formatAttendanceMonthAnswer(pack),
        pack,
      },
    },
    links: pack.links.slice(0, 12),
  };
}
