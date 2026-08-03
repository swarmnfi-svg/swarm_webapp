/**
 * NOVA recipe registry — bounded skill compositions (not free agents).
 */
import type { SessionUser } from "@/auth";
import type { DateRange } from "@/lib/ai/nova-dates";
import { extractNovaNamedProjectHint } from "@/lib/ai/nova-lexicon";
import type { NovaToolFact, NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  assertRecipeContract,
  filterRecipeToolsForUser,
  type NovaRecipe,
} from "@/lib/nova/recipes/recipe-contract";
import {
  DAILY_BRIEF_FANOUT_CONCURRENCY,
  mapWithConcurrency,
} from "@/lib/nova/skills/ops/daily-brief";
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";
import { buildNovaFinding, formatNovaFindings, type NovaFinding } from "@/lib/nova/recipes/finding";

export const NOVA_RECIPES: readonly NovaRecipe[] = [
  {
    id: "month_performance",
    label: "Director Month Performance",
    description:
      "Period-explicit month summary with sales, collections, overdue, director/bank, project/CBG chapters.",
    toolIds: [
      "sales_summary",
      "receipts_summary",
      "overdue_invoices",
      "receivables_summary",
      "director_dashboard_summary",
      "bank_accounts_summary",
      "projects_summary",
      "cbg_quotations_summary",
    ],
    readOnly: true,
    maximumSteps: 8,
    examples: [
      "How is this month going?",
      "Month performance",
      "Director brief for this month",
    ],
  },
  {
    id: "attendance_month",
    label: "Attendance Month",
    description:
      "Calendar-month attendance overview (present/late/absent) with optional leave/reg chapters.",
    toolIds: [
      "attendance_late_summary",
      "leave_summary",
      "regularisation_summary",
      "overtime_summary",
    ],
    readOnly: true,
    maximumSteps: 4,
    examples: [
      "how is this month's attendance?",
      "how is this month attendance",
      "attendance this month",
    ],
  },
  {
    id: "cash_banking",
    label: "Cash / Banking",
    description:
      "Bank position + receipts + recon + payment requests (facts only; respects balance RBAC).",
    toolIds: [
      "bank_accounts_summary",
      "bank_recon_summary",
      "receipts_summary",
      "payment_requests_summary",
    ],
    readOnly: true,
    maximumSteps: 4,
    examples: [
      "how is cash this week?",
      "cash and banking this month",
      "bank balances",
      "cash position",
    ],
  },
  {
    id: "collection_attention",
    label: "Collection attention",
    description:
      "Compose outstanding + overdue + receipts for a customer (facts only — not a risk score).",
    toolIds: [
      "customers_summary",
      "customer_outstanding",
      "overdue_invoices",
      "receipts_summary",
    ],
    readOnly: true,
    maximumSteps: 3,
    examples: [
      "collection attention for Avaada",
      "collections focus Miura",
      "outstanding and overdue for Tata",
    ],
  },
  {
    id: "project_command",
    label: "Project Command",
    description:
      "Everything important about a project — SO/PO/delivery/invoice/cash/tasks (facts only).",
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
    ],
  },
  {
    id: "cbg_pipeline",
    label: "CBG pipeline",
    description: "CBG quotation status funnel from registered skill facts.",
    toolIds: ["cbg_quotations_summary"],
    readOnly: true,
    maximumSteps: 1,
    examples: ["CBG pipeline", "CBG quotation funnel", "CBG status breakdown"],
  },
  {
    id: "project_health",
    label: "Project health",
    description:
      "Project-scoped task/checklist/delivery/invoice facts only — refuses theatre when scopedFacts missing.",
    toolIds: ["projects_summary"],
    readOnly: true,
    maximumSteps: 1,
    examples: ["project health for Tata plant", "how is project X doing"],
  },
];

export function getNovaRecipe(id: string): NovaRecipe | undefined {
  return NOVA_RECIPES.find((r) => r.id === id);
}

export function listNovaRecipes(): readonly NovaRecipe[] {
  return NOVA_RECIPES;
}

export type NovaRecipeRunResult = {
  recipeId: string;
  runnableToolIds: string[];
  omittedNotes: string[];
  facts: NovaToolFact[];
  links: NovaToolLink[];
  findings: NovaFinding[];
};

function slimErrorNote(toolId: string, fact: NovaToolFact): string | null {
  if (fact.denied) return `Omitted ${toolId} (permission).`;
  if (!fact.ok) return `Omitted ${toolId} (${fact.error ?? "failed"}).`;
  return null;
}

export async function runNovaRecipe(
  recipeId: string,
  ctx: NovaSkillHandlerContext
): Promise<NovaRecipeRunResult> {
  const recipe = getNovaRecipe(recipeId);
  if (!recipe) {
    return {
      recipeId,
      runnableToolIds: [],
      omittedNotes: [`Unknown recipe ${recipeId}`],
      facts: [],
      links: [],
      findings: [],
    };
  }
  const contractErrors = assertRecipeContract(recipe);
  if (contractErrors.length) {
    return {
      recipeId,
      runnableToolIds: [],
      omittedNotes: contractErrors,
      facts: [],
      links: [],
      findings: [],
    };
  }

  const runnable = filterRecipeToolsForUser(ctx.user, recipe);
  const omittedNotes: string[] = [];
  for (const t of recipe.toolIds) {
    if (!runnable.includes(t)) omittedNotes.push(`Omitted ${t} (RBAC or cap).`);
  }

  const { dispatchNovaSkill } = await import("@/lib/nova/skills/registry");
  const fanOut = await mapWithConcurrency(
    runnable,
    DAILY_BRIEF_FANOUT_CONCURRENCY,
    async (toolId) => {
      try {
        return await dispatchNovaSkill(toolId, ctx);
      } catch (e) {
        return {
          fact: {
            tool: toolId,
            ok: false,
            error: e instanceof Error ? e.message : "recipe step failed",
          } satisfies NovaToolFact,
          links: [] as NovaToolLink[],
        };
      }
    }
  );

  const facts: NovaToolFact[] = [];
  const links: NovaToolLink[] = [];
  for (const row of fanOut) {
    if (!row) continue;
    const note = slimErrorNote(row.fact.tool, row.fact);
    if (note) omittedNotes.push(note);
    else {
      facts.push(row.fact);
      if (row.links?.length) links.push(...row.links);
    }
  }

  const findings =
    recipeId === "collection_attention"
      ? buildCollectionAttentionFindings(facts, ctx)
      : recipeId === "cbg_pipeline"
        ? buildCbgPipelineFindings(facts)
        : recipeId === "project_health"
          ? buildProjectHealthFindings(facts, ctx)
          : [];

  return { recipeId, runnableToolIds: runnable, omittedNotes, facts, links, findings };
}

function buildCollectionAttentionFindings(
  facts: NovaToolFact[],
  ctx: NovaSkillHandlerContext
): NovaFinding[] {
  const out: NovaFinding[] = [];
  const customers = facts.find((f) => f.tool === "customers_summary" && f.ok);
  const outstanding = facts.find((f) => f.tool === "customer_outstanding" && f.ok);
  const overdue = facts.find((f) => f.tool === "overdue_invoices" && f.ok);
  const receipts = facts.find((f) => f.tool === "receipts_summary" && f.ok);
  const party = ctx.entityFilterName ?? ctx.entityHint ?? "selected customer";

  // Customer master chapter (customer-chapter prep) — headcount only; never invents AR.
  if (customers?.data) {
    const d = customers.data as Record<string, unknown>;
    const active = Number(d.activeCount ?? d.active ?? 0);
    const total = Number(d.totalCount ?? d.total ?? active);
    out.push(
      buildNovaFinding({
        observation:
          total === 0
            ? "No customers in master for your filter."
            : `Customer master: ${active} active / ${total} total` +
              (ctx.entityFilterName || ctx.entityHint ? ` (context for ${party}).` : "."),
        evidence: [
          {
            toolId: "customers_summary",
            summary: `active=${active}; total=${total}`,
          },
        ],
        contributors: [{ toolId: "customers_summary", role: "customer master" }],
        recommendation: { label: "Customers", href: "/customers" },
        confidence: "fact",
      })
    );
  }

  if (outstanding?.data) {
    const d = outstanding.data as Record<string, unknown>;
    const total = String(d.outstandingTotalInr ?? d.outstandingTotal ?? "—");
    const rows = Number(d.rowCount ?? 0);
    out.push(
      buildNovaFinding({
        observation:
          rows === 0
            ? `No open outstanding for ${party}.`
            : `${party} outstanding is ${total} across ${rows} row(s).`,
        evidence: [
          {
            toolId: "customer_outstanding",
            entityIds: ctx.resolvedEntityDbId ? [ctx.resolvedEntityDbId] : undefined,
            summary: `outstandingTotalInr=${total}; rowCount=${rows}`,
          },
        ],
        contributors: [{ toolId: "customer_outstanding", role: "AR balance" }],
        recommendation: { label: "Receivables", href: "/accounts/receivables" },
        confidence: "fact",
      })
    );
  }

  if (overdue?.data) {
    const d = overdue.data as Record<string, unknown>;
    const count = Number(d.count ?? 0);
    out.push(
      buildNovaFinding({
        observation:
          count === 0
            ? `No overdue invoices for ${party}.`
            : `${count} overdue invoice(s) for ${party}.`,
        evidence: [
          {
            toolId: "overdue_invoices",
            summary: `count=${count}`,
          },
        ],
        contributors: [{ toolId: "overdue_invoices", role: "overdue queue" }],
        recommendation: { label: "Billing", href: "/billing" },
        confidence: "fact",
      })
    );
  }

  if (receipts?.data) {
    const d = receipts.data as Record<string, unknown>;
    const collected = String(d.totalCollectedInr ?? d.totalInr ?? "—");
    const rc = Number(d.receiptCount ?? d.count ?? 0);
    out.push(
      buildNovaFinding({
        observation:
          rc === 0
            ? `No receipts in period for ${party}.`
            : `${rc} receipt(s) collecting ${collected} in period for ${party}.`,
        evidence: [
          {
            toolId: "receipts_summary",
            summary: `receiptCount=${rc}; totalCollectedInr=${collected}`,
          },
        ],
        contributors: [{ toolId: "receipts_summary", role: "collections" }],
        recommendation: { label: "Receipts", href: "/receipts" },
        confidence: "fact",
      })
    );
  }

  if (outstanding?.data && overdue?.data) {
    const od = overdue.data as Record<string, unknown>;
    const oc = Number(od.count ?? 0);
    if (oc > 0) {
      out.push(
        buildNovaFinding({
          observation: `Collection attention: ${party} has open outstanding with ${oc} overdue invoice(s) — follow receivables and billing deep links.`,
          evidence: [
            {
              toolId: "customer_outstanding",
              summary: "outstanding present",
            },
            {
              toolId: "overdue_invoices",
              summary: `overdue count=${oc}`,
            },
          ],
          contributors: [
            { toolId: "customer_outstanding", role: "AR" },
            { toolId: "overdue_invoices", role: "overdue" },
          ],
          recommendation: { label: "Receivables", href: "/accounts/receivables" },
          confidence: "supported_inference",
        })
      );
    }
  }

  return out;
}

function buildCbgPipelineFindings(facts: NovaToolFact[]): NovaFinding[] {
  const f = facts.find((x) => x.tool === "cbg_quotations_summary" && x.ok);
  if (!f?.data) return [];
  const d = f.data as Record<string, unknown>;
  const count = Number(d.quotationCount ?? 0);
  const byStatus = (d.byStatus as { status?: string; count?: number }[]) ?? [];
  const funnel = byStatus.map((s) => `${s.status}×${s.count}`).join(", ") || "no statuses";
  return [
    buildNovaFinding({
      observation:
        count === 0
          ? "No CBG quotations in period."
          : `CBG pipeline: ${count} quotation(s) — ${funnel}.`,
      evidence: [
        {
          toolId: "cbg_quotations_summary",
          summary: `quotationCount=${count}; byStatus=${funnel}`,
        },
      ],
      contributors: [{ toolId: "cbg_quotations_summary", role: "status funnel" }],
      recommendation: { label: "CBG quotations", href: "/cbg-quotations" },
      confidence: "fact",
    }),
  ];
}

function buildProjectHealthFindings(
  facts: NovaToolFact[],
  ctx: NovaSkillHandlerContext
): NovaFinding[] {
  const f = facts.find((x) => x.tool === "projects_summary" && x.ok);
  if (!f?.data) return [];
  const d = f.data as Record<string, unknown>;
  const scoped = d.scopedFacts as Record<string, unknown> | null;
  if (!scoped) {
    return [
      buildNovaFinding({
        observation:
          "Project health needs a single resolved project with scoped ERP facts (tasks/checklist/deliveries/invoices). Name the project (or confirm an alias) — I will not invent health scores or site attendance.",
        evidence: [
          {
            toolId: "projects_summary",
            summary: "scopedFacts missing — honest gap, not theatre",
          },
        ],
        contributors: [{ toolId: "projects_summary", role: "gap disclosure" }],
        recommendation: { label: "Projects", href: "/projects" },
        confidence: "fact",
      }),
    ];
  }
  const name = String(scoped.projectName ?? ctx.entityFilterName ?? "project");
  return [
    buildNovaFinding({
      observation: `${name}: ${scoped.taskOpen ?? 0} open tasks, ${scoped.checklistOpen ?? 0} open checklist, ${scoped.deliveryCount ?? 0} deliveries, ${scoped.invoiceCount ?? 0} invoices` +
        (scoped.valueVisible ? ` (value ${scoped.projectValueInr}, budget ${scoped.budgetInr}, invoiced ${scoped.invoicedTotalInr})` : " (money hidden).") +
        " Site attendance-by-project not linked.",
      evidence: [
        {
          toolId: "projects_summary",
          entityIds: scoped.projectId ? [String(scoped.projectId)] : undefined,
          summary: JSON.stringify({
            taskOpen: scoped.taskOpen,
            checklistOpen: scoped.checklistOpen,
            deliveryCount: scoped.deliveryCount,
            invoiceCount: scoped.invoiceCount,
          }),
        },
      ],
      contributors: [{ toolId: "projects_summary", role: "scoped project facts" }],
      recommendation: { label: "Projects", href: "/projects" },
      confidence: "fact",
    }),
  ];
}

export function formatCollectionAttentionAnswer(result: NovaRecipeRunResult): string {
  const parts: string[] = ["Here’s collection attention from ERP facts:"];
  const findingsText = formatNovaFindings(result.findings);
  if (findingsText) parts.push(findingsText);
  if (result.omittedNotes.length) {
    parts.push("_Notes:_ " + result.omittedNotes.join(" "));
  }
  if (!result.findings.length && !result.facts.length) {
    parts.push("No collection facts available for your permissions or filter.");
  }
  return parts.join("\n\n");
}

/** Skill-shaped runner for registry dispatch. */
export async function runCollectionAttentionRecipe(
  ctx: NovaSkillHandlerContext
): Promise<{ fact: NovaToolFact; links?: NovaToolLink[] }> {
  const result = await runNovaRecipe("collection_attention", ctx);
  return {
    fact: {
      tool: "collection_attention",
      ok: true,
      data: {
        recipeId: result.recipeId,
        runnableToolIds: result.runnableToolIds,
        omittedNotes: result.omittedNotes,
        findings: result.findings,
        period: ctx.range?.label ?? null,
        entityFilter: ctx.entityFilterName ?? ctx.entityHint ?? null,
        note: "collection_attention composes outstanding + overdue + receipts — not a payment risk score.",
      },
    },
    links: [
      ...result.links,
      { title: "Receivables", href: "/accounts/receivables" },
      { title: "Billing", href: "/billing" },
    ],
  };
}

export async function runCbgPipelineRecipe(
  ctx: NovaSkillHandlerContext
): Promise<{ fact: NovaToolFact; links?: NovaToolLink[] }> {
  const result = await runNovaRecipe("cbg_pipeline", ctx);
  return {
    fact: {
      tool: "cbg_pipeline",
      ok: true,
      data: {
        recipeId: result.recipeId,
        runnableToolIds: result.runnableToolIds,
        omittedNotes: result.omittedNotes,
        findings: result.findings,
        period: ctx.range?.label ?? null,
        note: "cbg_pipeline uses quotation status counts — not a scored conversion model.",
      },
    },
    links: result.links,
  };
}

export async function runProjectHealthRecipe(
  ctx: NovaSkillHandlerContext
): Promise<{ fact: NovaToolFact; links?: NovaToolLink[] }> {
  const result = await runNovaRecipe("project_health", ctx);
  return {
    fact: {
      tool: "project_health",
      ok: true,
      data: {
        recipeId: result.recipeId,
        runnableToolIds: result.runnableToolIds,
        omittedNotes: result.omittedNotes,
        findings: result.findings,
        entityFilter: ctx.entityFilterName ?? ctx.entityHint ?? null,
        note: "project_health only when scopedFacts exist — never invents attendance-by-project.",
      },
    },
    links: result.links,
  };
}

export function recipeMatchesQuery(query: string): string | null {
  const q = query.toLowerCase();
  // Attendance Month before Month Performance — "how is this month attendance"
  // must not steal into director month.
  if (
    /\bhow\s+is\s+this\s+month'?s?\s+attendance\b/.test(q) ||
    /\bhow\s+is\s+(this\s+month|july|august|september|october|november|december|january|february|march|april|may|june)\s+attendance\b/.test(
      q
    ) ||
    /\b(this\s+month|month)\s+attendance\b/.test(q) ||
    /\battendance\s+(this\s+month|for\s+(this\s+month|july|august|september|october|november|december|january|february|march|april|may|june))\b/.test(
      q
    ) ||
    /\battendance\s+month\s+overview\b/.test(q) ||
    /\bwho\s+was\s+late\s+this\s+month\b/.test(q) ||
    /\babsent\s+days?\s+this\s+month\b/.test(q)
  ) {
    return "attendance_month";
  }
  if (
    /\bhow\s+is\s+cash\b/.test(q) ||
    /\bcash\s+and\s+banking\b/.test(q) ||
    /\bbank\s+balances?\b/.test(q) ||
    /\btotal\s+bank\s+balance\b/.test(q) ||
    /\bcash\s+position\b/.test(q) ||
    /\bunreconciled\s+bank\b/.test(q) ||
    /\breceipts\s+and\s+bank\b/.test(q) ||
    /\bhow\s+is\s+banking\b/.test(q) ||
    /\bexact\s+cash\s+on\s+hand\b/.test(q)
  ) {
    return "cash_banking";
  }
  if (
    /\bmonth\s+performance\b/.test(q) ||
    /\bdirector\s+brief\b/.test(q) ||
    /\bhow\s+is\s+(this\s+month|july|august|september|october|november|december|january|february|march|april|may|june)\s+going\b/.test(
      q
    ) ||
    /\bhow\s+is\s+this\s+month\b/.test(q) ||
    /\bhow(?:'s|\s+is)\s+business\b/.test(q) ||
    /\bhow\s+are\s+we\s+(doing|going)\b/.test(q) ||
    /\bbusiness\s+(overview|health)\b/.test(q) ||
    /^business$/.test(q.trim())
  ) {
    return "month_performance";
  }
  // Named project in utterance → Project Command (entity resolve), never unscoped
  // FY projects_summary. search_entities stays for find/lookup only.
  {
    const named = extractNovaNamedProjectHint(query);
    if (
      named &&
      !/\b(find|search|look\s*up|lookup)\b/i.test(query) &&
      !(
        /\bprojects?\s+(named|called)\b/i.test(query) &&
        !/\b(work|task|photo|picture|image|responsible|details?|handled)\b/i.test(query)
      )
    ) {
      return "project_command";
    }
  }
  if (
    /\bproject\s+command\b/.test(q) ||
    /\beverything\s+important\s+about\s+(this\s+)?project\b/.test(q) ||
    /\btell\s+me\s+everything\s+.*\bproject\b/.test(q) ||
    /\bproject\s+deep\s+dive\b/.test(q) ||
    /\boverdue\s+invoices?\s+on\s+(this\s+)?project\b/.test(q) ||
    // Tasks chapter (tasks-light prep · project_chapter) — project-scoped tasks → Project Command
    /\b(open|overdue|pending)\s+tasks?\s+(on|in|for)\s+(this\s+)?project\b/.test(q) ||
    /\btasks?\s+(open|overdue|pending)\s+(on|in|for)\s+(this\s+)?project\b/.test(q) ||
    /\btasks?\s+pending\s+in\b/.test(q) ||
    /\b(open|overdue)\s+tasks?\s+on\b/.test(q) ||
    /\bso\b.+\bpo\b.+\b(delivery|invoice|cash).+\b(project|plant)\b/.test(q) ||
    /\bis\s+project\b.+\bhealthy\b/.test(q)
  ) {
    return "project_command";
  }
  if (
    /\bcollection\s+attention\b/.test(q) ||
    /\bcollections?\s+focus\b/.test(q) ||
    /\b(outstanding\s+and\s+overdue|overdue\s+and\s+outstanding)\b/.test(q) ||
    /\bcollection\s+status\b/.test(q) ||
    /\bwho\s+needs\s+collection\s+attention\b/.test(q) ||
    /\bar\s+ageing\b/.test(q) ||
    /\bageing\s+and\s+concentration\b/.test(q) ||
    /\bunallocated\s+advances\b/.test(q) ||
    /\bcollection\s+priorities\b/.test(q) ||
    /\bcollection\s+risk(\s+score)?\b/.test(q) ||
    // Customer chapter deepen — party + master context → Collection (not a 4th pack)
    /\bcustomer\s+context\s+for\b/.test(q) ||
    /\bcustomer\s+master\s+for\b/.test(q) ||
    /\bwho\s+is\s+this\s+customer\b.+\bcollection\b/.test(q)
  ) {
    return "collection_attention";
  }
  if (
    /\bcbg\s+(pipeline|funnel|status\s+breakdown)\b/.test(q) ||
    /\bcbg\s+pipeline\b/.test(q) ||
    /\bcbg\s+quotations?\s+pipeline\b/.test(q)
  ) {
    return "cbg_pipeline";
  }
  if (
    /\bproject\s+health\b/.test(q) ||
    /\bhow\s+is\s+(the\s+)?project\b/.test(q) ||
    /\bproject\s+status\s+health\b/.test(q)
  ) {
    return "project_health";
  }
  return null;
}

export type { NovaRecipe };
export type { DateRange, SessionUser };
