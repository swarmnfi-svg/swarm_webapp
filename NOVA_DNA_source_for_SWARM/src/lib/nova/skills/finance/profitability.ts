/**
 * Finance skill — profitability_summary (extracted from nova-tools; behaviour identical).
 * Report-intent asks return a savable project_pl_report pack (PDF + charts).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { novaMoney } from "@/lib/ai/nova-money";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

const n = (v: unknown) => Number(v ?? 0);

export async function runProfitabilitySummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, range, sampleLimit } = ctx;
  const name = "profitability_summary";
  const links: NovaToolLink[] = [];

  if (!can(user, "project.profitability.view")) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing project.profitability.view",
      },
    };
  }

  const showMoney = canViewOrgFinanceAggregates(user);
  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const [{ getFundPositionSummary }, { getProjectPlPage }] = await Promise.all([
    import("@/lib/finance/financial-account-queries"),
    import("@/lib/reports/queries"),
  ]);
  const [{ getProjectPl }, fund, plPage] = await Promise.all([
    import("@/lib/reports/queries"),
    showMoney ? getFundPositionSummary().catch(() => null) : Promise.resolve(null),
    getProjectPlPage(1, 8).catch(() => null),
  ]);
  const q = query.toLowerCase();
  const wantsLoss =
    /\b(loss(?:es)?|loss[-\s]*making|on\s+loss|in\s+loss|at\s+loss|negative\s+margin|margin\s+negative)\b/i.test(
      q
    );
  const wantsProfit =
    wantsLoss ||
    /\b(project\s+profit|project\s+margin|profitability|project\s+p\s*&\s*l|project\s+pnl|project[-\s]*wise\s+profit|profits?\s+by\s+projects?)\b/i.test(
      q
    );
  type PlRow = NonNullable<NonNullable<typeof plPage>["rows"]>[number];
  type PlSettle = { ok: true; rows: PlRow[] } | { ok: false };
  let plSettle: PlSettle;
  if (wantsProfit || reportIntent) {
    try {
      plSettle = { ok: true, rows: (await getProjectPl()) as PlRow[] };
    } catch {
      plSettle = { ok: false };
    }
  } else {
    plSettle = { ok: true, rows: (plPage?.rows ?? []) as PlRow[] };
  }
  // Soft-fail: never map P&L lookup failure to "0 loss-making projects".
  if (!plSettle.ok) {
    return {
      fact: {
        tool: name,
        ok: false,
        error:
          "Project P&L lookup failed. Open /reports/project-pl — do not treat as zero loss/profit.",
      },
      links: [
        { title: "Projects", href: "/projects" },
        { title: "Project P&L", href: "/reports/project-pl" },
      ],
    };
  }
  const allRows = plSettle.rows;
  const rows = allRows.length > 0 ? allRows : ((plPage?.rows ?? []) as PlRow[]);
  const lossRows = rows.filter((r) => n(r.margin) < -0.01);
  const profitableRows = rows.filter((r) => n(r.margin) > 0.01);
  const flatRows = rows.filter((r) => Math.abs(n(r.margin)) <= 0.01);
  const statusBreakdown = rows.reduce<Record<string, number>>((acc, r) => {
    const status = String(r.status ?? "UNKNOWN");
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
  const sampleRows = (wantsLoss ? lossRows : rows)
    .slice()
    .sort((a, b) => n(a.margin) - n(b.margin))
    .slice(0, reportIntent ? rowCap : (sampleLimit ?? 8));
  const fundMoney =
    fund && showMoney
      ? {
          cashInHand: novaMoney(fund.cashInHand),
          positiveBank: novaMoney(fund.positiveBank),
          netFundsAvailable: novaMoney(fund.netFundsAvailable),
          odCcUtilised: novaMoney(fund.odCcUtilised),
          odCcAvailable: novaMoney(fund.odCcAvailable),
        }
      : null;

  links.push({ title: "Projects", href: "/projects" });
  links.push({ title: "Project P&L", href: "/reports/project-pl" });

  const focusedRows = sampleRows.map((r) => {
    const inv = novaMoney(r.invoiced);
    const rec = novaMoney(r.received);
    const pur = novaMoney(r.purchases);
    const mar = novaMoney(r.margin);
    const out = novaMoney(r.outstanding);
    return {
      project: r.projectName,
      projectId: r.projectId,
      status: r.status,
      invoiced: showMoney ? inv.value : null,
      invoicedInr: showMoney ? inv.valueInr : "hidden",
      received: showMoney ? rec.value : null,
      receivedInr: showMoney ? rec.valueInr : "hidden",
      purchases: showMoney ? pur.value : null,
      purchasesInr: showMoney ? pur.valueInr : "hidden",
      margin: showMoney ? mar.value : null,
      marginInr: showMoney ? mar.valueInr : "hidden",
      outstanding: showMoney ? out.value : null,
      outstandingInr: showMoney ? out.valueInr : "hidden",
    };
  });

  const data = withFactProvenance(
    {
      balancesVisible: showMoney,
      netFundsAvailableInr: fundMoney?.netFundsAvailable.valueInr ?? null,
      fundPosition: fundMoney
        ? {
            cashInHand: fundMoney.cashInHand.value,
            cashInHandInr: fundMoney.cashInHand.valueInr,
            positiveBank: fundMoney.positiveBank.value,
            positiveBankInr: fundMoney.positiveBank.valueInr,
            netFundsAvailable: fundMoney.netFundsAvailable.value,
            netFundsAvailableInr: fundMoney.netFundsAvailable.valueInr,
            odCcUtilised: fundMoney.odCcUtilised.value,
            odCcUtilisedInr: fundMoney.odCcUtilised.valueInr,
            odCcAvailable: fundMoney.odCcAvailable.value,
            odCcAvailableInr: fundMoney.odCcAvailable.valueInr,
          }
        : null,
      projectPlSample: rows.slice(0, 6).map((r) => {
        const inv = novaMoney(r.invoiced);
        const rec = novaMoney(r.received);
        const pur = novaMoney(r.purchases);
        const mar = novaMoney(r.margin);
        const out = novaMoney(r.outstanding);
        return {
          project: r.projectName,
          projectId: r.projectId,
          status: r.status,
          invoiced: showMoney ? inv.value : null,
          invoicedInr: showMoney ? inv.valueInr : "hidden",
          received: showMoney ? rec.value : null,
          receivedInr: showMoney ? rec.valueInr : "hidden",
          purchases: showMoney ? pur.value : null,
          purchasesInr: showMoney ? pur.valueInr : "hidden",
          margin: showMoney ? mar.value : null,
          marginInr: showMoney ? mar.valueInr : "hidden",
          outstanding: showMoney ? out.value : null,
          outstandingInr: showMoney ? out.valueInr : "hidden",
        };
      }),
      projectPlFocus: wantsLoss ? "loss_making_projects" : "project_profitability",
      projectPlScope: "all projects, all time",
      projectPlScopeNote:
        "All active and closed projects are included by default. NOVA does not assume current FY for project profit/loss unless a dedicated FY lifecycle report is added.",
      projectPlSot:
        "Project P&L report SoT: net invoiced revenue (posted invoices + debit notes - credit notes) minus approved purchase bills and paid non-bill project payment requests. Outstanding is contract balance when Project.projectValue exists, otherwise invoice AR.",
      projectPlGapNote:
        "Project-level incentives/manual cost adjustments are available on individual project profitability screens, not in this summary roll-up.",
      requestedPeriodLabel: range?.label ?? null,
      requestedPeriodApplied: false,
      statusBreakdown,
      lossMakingProjectCount: showMoney ? lossRows.length : null,
      profitableProjectCount: showMoney ? profitableRows.length : null,
      breakEvenProjectCount: showMoney ? flatRows.length : null,
      lossProjects: showMoney
        ? lossRows.slice(0, 8).map((r) => {
            const mar = novaMoney(r.margin);
            const out = novaMoney(r.outstanding);
            return {
              project: r.projectName,
              projectId: r.projectId,
              status: r.status,
              margin: mar.value,
              marginInr: mar.valueInr,
              outstanding: out.value,
              outstandingInr: out.valueInr,
            };
          })
        : [],
      focusedProjectPlRows: focusedRows,
      projectPlTotal: rows.length || plPage?.total || 0,
      moneyNote: "Copy *Inr fields exactly. Never reinterpret Indian commas.",
      note:
        "Fund position + all-time project P&L summary. Closed projects are included where project P&L facts exist.",
    },
    { sources: ["profitability"] }
  );

  if (reportIntent) {
    const chartRows = (wantsLoss ? lossRows : rows)
      .slice()
      .sort((a, b) => n(a.margin) - n(b.margin))
      .slice(0, 8);
    const { attachment } = buildSkillReportPack({
      packId: "project_pl_report",
      reportMode,
      title: wantsLoss ? "Loss-making projects report" : "Project P&L report",
      headline: showMoney
        ? `${rows.length} project(s) · ${lossRows.length} loss-making · ${profitableRows.length} profitable`
        : `${rows.length} project(s) — money totals hidden for your role`,
      period: {
        label: "all projects, all time",
        grain: "open",
        calendarKind: "point_in_time",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "project_pl.total_projects",
          version: "1",
          certification: "draft",
          value: rows.length,
          display: `${rows.length} projects`,
        },
        {
          metricId: "project_pl.loss_making_count",
          version: "1",
          certification: "draft",
          value: showMoney ? lossRows.length : null,
          display: showMoney ? `${lossRows.length} loss-making` : "hidden",
        },
        {
          metricId: "project_pl.profitable_count",
          version: "1",
          certification: "draft",
          value: showMoney ? profitableRows.length : null,
          display: showMoney ? `${profitableRows.length} profitable` : "hidden",
        },
      ],
      charts: showMoney
        ? [
            {
              bindingId: "ageing_or_attention",
              metricIds: ["project_pl.loss_making_count"],
              title: wantsLoss ? "Loss margin by project" : "Margin by project (worst first)",
              points: chartRows.map((r) => ({
                label: String(r.projectId || r.projectName || "Project").slice(0, 18),
                value: n(r.margin),
                unit: "inr",
              })),
            },
            {
              bindingId: "kpi_strip",
              metricIds: ["project_pl.total_projects"],
              title: "Projects by status",
              points: Object.entries(statusBreakdown).map(([label, value]) => ({
                label: label.slice(0, 18),
                value,
                unit: "count",
              })),
            },
          ]
        : [],
      tables: [
        {
          id: "project_pl_rows",
          title: wantsLoss ? "Loss-making projects" : "Project P&L sample",
          columns: ["Project", "Status", "Invoiced", "Costs", "Margin", "Outstanding"],
          rows: focusedRows.map((r) => [
            reportCell([r.projectId, r.project].filter(Boolean).join(" ")),
            reportCell(r.status),
            reportCell(r.invoicedInr),
            reportCell(r.purchasesInr),
            reportCell(r.marginInr),
            reportCell(r.outstandingInr),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      warnings: showMoney
        ? []
        : [
            {
              code: "permission_omission",
              message: "Money columns hidden — missing org finance aggregate permission.",
              source: name,
            },
          ],
      omittedNotes: [
        "Project P&L SoT: net invoiced revenue minus approved purchase bills and paid non-bill project PRs.",
      ],
    });
    return {
      fact: {
        tool: name,
        ok: true,
        data: withSkillReportAttachment(data as Record<string, unknown>, attachment),
      },
      links,
    };
  }

  return {
    fact: {
      tool: name,
      ok: true,
      data,
    },
    links,
  };
}
