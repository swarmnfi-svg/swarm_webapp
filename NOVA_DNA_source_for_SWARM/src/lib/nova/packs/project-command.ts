/**
 * Project Command pack — NOVA 3.0 Sprint 5.
 * “Tell me everything important about this project” — EPC spine facts, no theatre.
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
  type NovaPackResult,
  type NovaPackWarning,
} from "@/lib/nova/pack-result";
import { NOVA_MONTH_ATTENTION_PRIMARY_MAX } from "@/lib/nova/invariants";
import {
  buildNovaTrustWarnings,
  maxCacheAgeMsFromFacts,
  trustWarningsToPackWarnings,
} from "@/lib/nova/freshness-trust";

export const PROJECT_COMMAND_PACK_VERSION = "1.0.0";

export const PROJECT_COMMAND_RECIPE: NovaRecipe = {
  id: "project_command",
  label: "Project Command",
  description:
    "Everything important about a project: tasks, SO/PO, delivery, invoices, receipts — facts only.",
  toolIds: [
    "projects_summary",
    "tasks_summary",
    "sales_orders_summary",
    "purchase_orders_summary",
    "delivery_summary",
    "sales_summary",
    "receipts_summary",
    "overdue_invoices",
  ],
  readOnly: true,
  maximumSteps: 8,
  examples: [
    "tell me everything important about this project",
    "Project Command for Tata plant",
    "project deep dive",
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
  if (/no overdue|needs a single resolved|not invent|missing/i.test(o)) return /missing|needs a single/.test(o);
  return /overdue|due within|open task|attention|behind|gap|0 deliveries|no invoice/i.test(o);
}

function buildFindings(facts: NovaToolFact[], ctx: NovaSkillHandlerContext): NovaFinding[] {
  const out: NovaFinding[] = [];
  const project = facts.find((f) => f.tool === "projects_summary" && f.ok);
  const tasks = facts.find((f) => f.tool === "tasks_summary" && f.ok);
  const so = facts.find((f) => f.tool === "sales_orders_summary" && f.ok);
  const po = facts.find((f) => f.tool === "purchase_orders_summary" && f.ok);
  const del = facts.find((f) => f.tool === "delivery_summary" && f.ok);
  const sales = facts.find((f) => f.tool === "sales_summary" && f.ok);
  const receipts = facts.find((f) => f.tool === "receipts_summary" && f.ok);
  const overdue = facts.find((f) => f.tool === "overdue_invoices" && f.ok);
  const name = ctx.entityFilterName ?? ctx.entityHint ?? "this project";

  if (project?.data) {
    const d = project.data as Record<string, unknown>;
    const scoped = d.scopedFacts as Record<string, unknown> | null;
    if (!scoped && !ctx.resolvedEntityDbId) {
      out.push(
        buildNovaFinding({
          observation:
            "Project Command needs a single resolved project — name it or confirm from clarify. I will not invent EPC health scores.",
          evidence: [{ toolId: "projects_summary", summary: "scopedFacts missing" }],
          contributors: [{ toolId: "projects_summary", role: "gap" }],
          recommendation: { label: "Projects", href: "/projects" },
          confidence: "fact",
        })
      );
    } else if (scoped) {
      out.push(
        buildNovaFinding({
          observation: `${String(scoped.projectName ?? name)}: ${n(scoped.taskOpen)} open tasks, ${n(scoped.checklistOpen)} checklist open, ${n(scoped.deliveryCount)} deliveries, ${n(scoped.invoiceCount)} invoices.`,
          evidence: [
            {
              toolId: "projects_summary",
              entityIds: scoped.projectId ? [String(scoped.projectId)] : undefined,
              summary: "scoped EPC spine",
            },
          ],
          contributors: [{ toolId: "projects_summary", role: "project spine" }],
          recommendation: { label: "Projects", href: "/projects" },
          confidence: "fact",
        })
      );
    }
  }

  if (tasks?.data) {
    const d = tasks.data as Record<string, unknown>;
    const open = n(d.openCount ?? d.open ?? d.count);
    const overdue = n(d.overdueCount ?? d.overdue);
    const dueSoon = n(d.dueSoonCount ?? d.dueSoon);
    const completed = n(d.completedCount ?? d.completed);
    const completedPeriod = d.completedPeriod != null ? String(d.completedPeriod) : "period";
    // Tasks chapter deepen (tasks-light prep · project_chapter ship): open + overdue/due-soon attentions.
    if (open > 0) {
      out.push(
        buildNovaFinding({
          observation: `${open} open task(s) on ${name}.`,
          evidence: [{ toolId: "tasks_summary", summary: `open=${open}` }],
          contributors: [{ toolId: "tasks_summary", role: "open" }],
          recommendation: { label: "Tasks", href: "/tasks" },
          confidence: "fact",
        })
      );
    }
    if (overdue > 0) {
      out.push(
        buildNovaFinding({
          observation: `${overdue} overdue task(s) on ${name} — attention.`,
          evidence: [{ toolId: "tasks_summary", summary: `overdue=${overdue}` }],
          contributors: [{ toolId: "tasks_summary", role: "overdue" }],
          recommendation: { label: "Tasks", href: "/tasks" },
          confidence: "fact",
        })
      );
    }
    if (dueSoon > 0) {
      out.push(
        buildNovaFinding({
          observation: `${dueSoon} task(s) due within 7 days on ${name}.`,
          evidence: [{ toolId: "tasks_summary", summary: `dueSoon=${dueSoon}` }],
          contributors: [{ toolId: "tasks_summary", role: "due soon" }],
          recommendation: { label: "Tasks", href: "/tasks" },
          confidence: "fact",
        })
      );
    }
    if (completed > 0) {
      out.push(
        buildNovaFinding({
          observation: `${completed} completed on ${name} in ${completedPeriod}.`,
          evidence: [
            {
              toolId: "tasks_summary",
              summary: `completed=${completed}; period=${completedPeriod}`,
            },
          ],
          contributors: [{ toolId: "tasks_summary", role: "completed" }],
          recommendation: { label: "Tasks", href: "/tasks" },
          confidence: "fact",
        })
      );
    }
  }

  if (so?.data) {
    const d = so.data as Record<string, unknown>;
    out.push(
      buildNovaFinding({
        observation: `Sales orders in scope: ${n(d.count ?? d.orderCount)}.`,
        evidence: [{ toolId: "sales_orders_summary", summary: "SO chapter" }],
        contributors: [{ toolId: "sales_orders_summary", role: "SO" }],
        recommendation: { label: "Sales orders", href: "/sales-orders" },
        confidence: "fact",
      })
    );
  }

  if (po?.data) {
    const d = po.data as Record<string, unknown>;
    out.push(
      buildNovaFinding({
        observation: `Purchase orders in scope: ${n(d.count ?? d.orderCount)}.`,
        evidence: [{ toolId: "purchase_orders_summary", summary: "PO chapter" }],
        contributors: [{ toolId: "purchase_orders_summary", role: "PO" }],
        recommendation: { label: "Purchase orders", href: "/purchase-orders" },
        confidence: "fact",
      })
    );
  }

  if (del?.data) {
    const d = del.data as Record<string, unknown>;
    out.push(
      buildNovaFinding({
        observation: `Deliveries in scope: ${n(d.count ?? d.deliveryCount)}.`,
        evidence: [{ toolId: "delivery_summary", summary: "delivery chapter" }],
        contributors: [{ toolId: "delivery_summary", role: "delivery" }],
        recommendation: { label: "Deliveries", href: "/delivery" },
        confidence: "fact",
      })
    );
  }

  if (sales?.data) {
    const d = sales.data as Record<string, unknown>;
    out.push(
      buildNovaFinding({
        observation: `Invoiced: ${String(d.grandTotalInr ?? d.grandTotal ?? "—")} (${n(d.invoiceCount ?? d.count)} invoice(s)).`,
        evidence: [{ toolId: "sales_summary", summary: "invoice chapter" }],
        contributors: [{ toolId: "sales_summary", role: "invoices" }],
        recommendation: { label: "Billing", href: "/billing" },
        confidence: "fact",
      })
    );
  }

  if (receipts?.data) {
    const d = receipts.data as Record<string, unknown>;
    out.push(
      buildNovaFinding({
        observation: `Cash collected: ${String(d.totalCollectedInr ?? d.totalCollected ?? "—")}.`,
        evidence: [{ toolId: "receipts_summary", summary: "cash chapter" }],
        contributors: [{ toolId: "receipts_summary", role: "cash" }],
        recommendation: { label: "Receipts", href: "/receipts" },
        confidence: "fact",
      })
    );
  }

  if (overdue?.data) {
    const d = overdue.data as Record<string, unknown>;
    const count = n(d.count);
    if (count > 0) {
      out.push(
        buildNovaFinding({
          observation: `${count} overdue invoice(s) on ${name} — collection attention.`,
          evidence: [{ toolId: "overdue_invoices", summary: `count=${count}` }],
          contributors: [{ toolId: "overdue_invoices", role: "overdue" }],
          recommendation: { label: "Billing", href: "/billing" },
          confidence: "fact",
        })
      );
    }
  }

  return out;
}

export async function runProjectCommandPack(
  ctx: NovaSkillHandlerContext
): Promise<{ pack: NovaPackResult }> {
  const errors = assertRecipeContract(PROJECT_COMMAND_RECIPE);
  if (errors.length) throw new Error(errors.join("; "));

  const runnable = filterRecipeToolsForUser(ctx.user, PROJECT_COMMAND_RECIPE);
  const omittedNotes: string[] = [];
  for (const t of PROJECT_COMMAND_RECIPE.toolIds) {
    if (!runnable.includes(t)) omittedNotes.push(`Omitted ${t} (permission).`);
  }

  const facts: NovaToolFact[] = [];
  const links: NovaToolLink[] = [];
  const results = await mapWithConcurrency(
    runnable,
    DAILY_BRIEF_FANOUT_CONCURRENCY,
    async (toolId) => {
      const { dispatchNovaSkill } = await import("@/lib/nova/skills/registry");
      return dispatchNovaSkill(toolId, ctx);
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

  const findings = buildFindings(facts, ctx);
  const attentions = selectNovaPackAttentions(
    findings.filter(isMaterial),
    NOVA_MONTH_ATTENTION_PRIMARY_MAX
  );
  const dataAsOf = new Date().toISOString();
  const warnings: NovaPackWarning[] = omittedNotes
    .filter((n) => /permission/i.test(n))
    .map((message) => ({ code: "permission_omission" as const, message }));
  warnings.push(
    ...trustWarningsToPackWarnings(
      buildNovaTrustWarnings({
        dataAsOf,
        cacheAgeMs: maxCacheAgeMsFromFacts(facts),
        isLivePack: true,
        role: ctx.user.role,
      })
    )
  );

  const pack = buildNovaPackResult({
    packId: "project_command",
    packVersion: PROJECT_COMMAND_PACK_VERSION,
    period: {
      label: ctx.range?.label ?? "as-of now",
      grain: ctx.range ? "month" : "latest",
      calendarKind: "point_in_time",
      source: ctx.range ? "explicit" : "default",
    },
    dataAsOf,
    metrics: [],
    facts,
    findings,
    attentions,
    charts: [],
    links,
    warnings,
    omittedNotes,
    narrativeHints: [
      `Project Command for ${ctx.entityFilterName ?? ctx.entityHint ?? "selected project"}.`,
      ...attentions.primary.map((a) => a.observation),
    ],
  });
  return { pack };
}

export function formatProjectCommandAnswer(pack: NovaPackResult): string {
  const parts = ["**Project Command**", ...pack.narrativeHints];
  const f = formatNovaFindings(pack.findings);
  if (f) parts.push(f);
  if (pack.attentions.overflowCount > 0) {
    parts.push(`_…and ${pack.attentions.overflowCount} more attentions._`);
  }
  if (pack.omittedNotes.length) parts.push("_Notes:_ " + pack.omittedNotes.join(" "));
  return parts.join("\n\n");
}

export async function runProjectCommandRecipe(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { pack } = await runProjectCommandPack(ctx);
  return {
    fact: {
      tool: "project_command",
      ok: true,
      data: {
        packId: pack.packId,
        packVersion: pack.packVersion,
        attentionCount: pack.attentions.primary.length,
        overflowCount: pack.attentions.overflowCount,
        narrative: formatProjectCommandAnswer(pack),
        pack,
      },
    },
    links: pack.links.slice(0, 12),
  };
}
