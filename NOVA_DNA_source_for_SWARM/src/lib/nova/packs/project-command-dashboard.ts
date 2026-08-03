/**
 * Project Command prep lite — project dashboard spine contract + read helper.
 *
 * Reuses existing ERP server reads (project page / financial summary / task
 * counts). Does **not** fan out NOVA skills, invent health scores, or call the
 * report plane. See PROJECT_COMMAND_HANDOFF.md § Prep lite.
 *
 * Aligns chapter ids with `PROJECT_COMMAND_CHAPTER_TOOLS` /
 * `PROJECT_COMMAND_METRIC_IDS` in project-command-prep.ts.
 */

import type { AccessUser } from "@/lib/rbac";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  canViewProjectBudget,
  canViewProjectInvoiced,
  canViewProjectValue,
  canViewPayments,
  canViewPurchaseBills,
} from "@/lib/project-financials-access";
import { summarizeProjectFinancials } from "@/lib/project-financial-summary";
import { inr } from "@/lib/format";
import {
  PROJECT_COMMAND_CHAPTER_TOOLS,
  PROJECT_COMMAND_METRIC_IDS,
  PROJECT_COMMAND_PACK_ID,
  PROJECT_COMMAND_PREP_VERSION,
} from "@/lib/nova/packs/project-command-prep";

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** Contract schema version for the dashboard spine JSON. */
export const PROJECT_COMMAND_DASHBOARD_CONTRACT_VERSION = "0.1.0-prep" as const;

/**
 * Hard gate: Save / download report for Project Command requires a
 * deployer health-matched report plane. Prep lite never enables this.
 */
export const PROJECT_COMMAND_REPORT_PLANE_GATE = {
  saveReportAvailable: false as const,
  reason:
    "Report plane Save/Download for Project Command is hard-gated until deployer health-match (save + download ACL + regenerate = new id).",
  dependsOn: "sprint3_report_plane" as const,
};

export type ProjectCommandDashboardChapterId =
  | "resolve"
  | "spine"
  | "tasks"
  | "sales_orders"
  | "purchase_orders"
  | "deliveries"
  | "invoices"
  | "cash"
  | "overdue"
  | "milestones";

export type ProjectCommandDashboardChapter = {
  id: ProjectCommandDashboardChapterId;
  /** Catalog tool that backs this chapter when pack fan-out runs */
  catalogToolId: (typeof PROJECT_COMMAND_CHAPTER_TOOLS)[number] | "projects_summary";
  /** Metric id from PROJECT_COMMAND_METRIC_IDS when applicable */
  metricId?: (typeof PROJECT_COMMAND_METRIC_IDS)[number];
  label: string;
  deferred?: boolean;
  omitted?: boolean;
  omitReason?: string;
  count?: number | null;
  /** Display value; "hidden" when RBAC omits money */
  display?: string | number | null;
};

export type ProjectCommandDashboardSpine = {
  contractVersion: typeof PROJECT_COMMAND_DASHBOARD_CONTRACT_VERSION;
  packId: typeof PROJECT_COMMAND_PACK_ID;
  prepVersion: typeof PROJECT_COMMAND_PREP_VERSION;
  dataAsOf: string;
  project: {
    id: string;
    projectId: string;
    projectName: string;
    status: string;
    customerName: string | null;
  };
  chapters: ProjectCommandDashboardChapter[];
  reportPlane: typeof PROJECT_COMMAND_REPORT_PLANE_GATE;
  /** Named-project routing must stay on project_command (James School etc.) */
  routingNotes: string[];
  links: { title: string; href: string }[];
};

export type ProjectCommandDashboardCounts = {
  taskOpen: number;
  checklistOpen: number;
  salesOrderCount: number;
  purchaseOrderCount: number;
  deliveryCount: number;
  invoiceCount: number;
  overdueInvoiceCount: number;
  /** null when value/invoiced/receipts hidden by RBAC */
  invoicedTotal: number | null;
  receivedTotal: number | null;
  /**
   * Product outstanding (SoT: summarizeProjectFinancials.outstanding) —
   * contract when projectValue > 0, else invoice AR.
   */
  outstandingTotal: number | null;
  /** Invoice-ledger AR; include when it differs from contract outstanding. */
  invoiceOutstandingTotal?: number | null;
  customerCreditTotal: number | null;
  projectValue: number | null;
  budget: number | null;
};

/** Pure mapper — unit-tested without DB. */
export function buildProjectCommandDashboardSpine(input: {
  project: ProjectCommandDashboardSpine["project"];
  counts: ProjectCommandDashboardCounts;
  dataAsOf?: string;
  omittedChapters?: Partial<
    Record<
      ProjectCommandDashboardChapterId,
      { omitted: true; omitReason: string }
    >
  >;
}): ProjectCommandDashboardSpine {
  const omit = input.omittedChapters ?? {};
  const c = input.counts;
  const money = (v: number | null) => (v == null ? "hidden" : inr(v));

  const moneyBits: string[] = [];
  if (c.projectValue != null) moneyBits.push(`value ${money(c.projectValue)}`);
  if (c.receivedTotal != null) moneyBits.push(`received ${money(c.receivedTotal)}`);
  if (c.outstandingTotal != null) moneyBits.push(`outstanding ${money(c.outstandingTotal)}`);
  if (
    c.invoiceOutstandingTotal != null &&
    c.invoiceOutstandingTotal > 0 &&
    (c.outstandingTotal == null ||
      Math.abs(c.invoiceOutstandingTotal - c.outstandingTotal) > 0.01)
  ) {
    moneyBits.push(`invoice outstanding ${money(c.invoiceOutstandingTotal)}`);
  }
  if (c.customerCreditTotal != null && c.customerCreditTotal > 0) {
    moneyBits.push(`credit ${money(c.customerCreditTotal)}`);
  }

  const chapters: ProjectCommandDashboardChapter[] = [
    {
      id: "spine",
      catalogToolId: "projects_summary",
      metricId: "projects.active_count",
      label: "Spine",
      display:
        `${input.project.projectName}: ${c.taskOpen} open tasks, ${c.checklistOpen} checklist open, ${c.deliveryCount} deliveries, ${c.invoiceCount} invoices` +
        (moneyBits.length ? `; ${moneyBits.join(", ")}.` : "."),
      ...omit.spine,
    },
    {
      id: "tasks",
      catalogToolId: "tasks_summary",
      metricId: "tasks.open",
      label: "Tasks",
      count: c.taskOpen,
      display: c.taskOpen,
      ...omit.tasks,
    },
    {
      id: "sales_orders",
      catalogToolId: "sales_orders_summary",
      metricId: "sales_orders.count",
      label: "SO",
      count: c.salesOrderCount,
      display: c.salesOrderCount,
      ...omit.sales_orders,
    },
    {
      id: "purchase_orders",
      catalogToolId: "purchase_orders_summary",
      metricId: "purchase_orders.count",
      label: "PO",
      count: c.purchaseOrderCount,
      display: c.purchaseOrderCount,
      ...omit.purchase_orders,
    },
    {
      id: "deliveries",
      catalogToolId: "delivery_summary",
      metricId: "delivery.summary",
      label: "Delivery",
      count: c.deliveryCount,
      display: c.deliveryCount,
      ...omit.deliveries,
    },
    {
      id: "invoices",
      catalogToolId: "sales_summary",
      metricId: "sales.period_total",
      label: "Invoice",
      count: c.invoiceCount,
      display: money(c.invoicedTotal),
      ...omit.invoices,
    },
    {
      id: "cash",
      catalogToolId: "receipts_summary",
      metricId: "receipts.period_collected",
      label: "Cash",
      display: money(c.receivedTotal),
      ...omit.cash,
    },
    {
      id: "overdue",
      catalogToolId: "overdue_invoices",
      metricId: "ar.overdue_invoice_count",
      label: "Attention",
      count: c.overdueInvoiceCount,
      display: c.overdueInvoiceCount,
      ...omit.overdue,
    },
    {
      id: "milestones",
      catalogToolId: "projects_summary",
      label: "Milestones",
      deferred: true,
      omitReason: "No catalog skill yet — do not invent milestone theatre.",
      ...omit.milestones,
    },
  ];

  return {
    contractVersion: PROJECT_COMMAND_DASHBOARD_CONTRACT_VERSION,
    packId: PROJECT_COMMAND_PACK_ID,
    prepVersion: PROJECT_COMMAND_PREP_VERSION,
    dataAsOf: input.dataAsOf ?? new Date().toISOString(),
    project: input.project,
    chapters,
    reportPlane: PROJECT_COMMAND_REPORT_PLANE_GATE,
    routingNotes: [
      "Named project asks (e.g. James School work/tasks/photos) route to recipe project_command — never FY projects_summary.",
      "Signature: tell me everything important about this project.",
      "This dashboard spine is read-only ERP facts; pack fan-out stays in runProjectCommandPack.",
    ],
    links: [
      { title: "Project", href: `/projects/${input.project.id}` },
      { title: "Projects", href: "/projects" },
    ],
  };
}

/**
 * Load spine for a project UUID using the same count/summary sources as the
 * project detail page (not NOVA skill dispatch).
 */
export async function loadProjectCommandDashboardSpine(
  projectDbId: string,
  user: AccessUser & { id?: string }
): Promise<
  | { ok: true; spine: ProjectCommandDashboardSpine }
  | { ok: false; status: 403 | 404; error: string }
> {
  if (!can(user, "project.read")) {
    return { ok: false, status: 403, error: "Missing project.read" };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectDbId },
    select: {
      id: true,
      projectId: true,
      projectName: true,
      status: true,
      projectValue: true,
      budget: true,
      customer: { select: { customerName: true } },
      invoices: {
        select: {
          status: true,
          dueDate: true,
          grandTotal: true,
          receipts: { select: { amount: true } },
          creditNotes: { select: { grandTotal: true, voidedAt: true } },
          debitNotes: { select: { grandTotal: true, voidedAt: true } },
        },
      },
      receipts: { select: { amount: true } },
      purchaseBills: {
        select: { totalInvoiceValue: true, approvalStatus: true },
      },
      paymentRequests: {
        select: { amount: true, status: true, purchaseBillId: true },
      },
      salesOrders: { select: { id: true } },
      deliveries: { select: { id: true } },
    },
  });

  if (!project) {
    return { ok: false, status: 404, error: "Project not found" };
  }

  const showValue = canViewProjectValue(user);
  const showBudget = canViewProjectBudget(user);
  const showInvoiced = canViewProjectInvoiced(user);
  const showPayments = canViewPayments(user);
  const showBills = canViewPurchaseBills(user);

  const openTaskStatuses = [
    "TODO",
    "IN_PROGRESS",
    "WAITING",
    "BLOCKED",
    "REVIEW",
  ] as const;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [taskOpen, checklistOpen, purchaseOrderCount] = await Promise.all([
    can(user, "task.read.self")
      ? prisma.task.count({
          where: {
            projectId: project.id,
            status: { in: [...openTaskStatuses] },
          },
        })
      : Promise.resolve(null as number | null),
    prisma.projectChecklistItem.count({
      where: { projectId: project.id, status: { not: "COMPLETED" } },
    }),
    can(user, "purchaseorder.read")
      ? prisma.purchaseOrder.count({ where: { projectRef: project.projectId } })
      : Promise.resolve(null as number | null),
  ]);

  const fin =
    showInvoiced || showPayments || showBills
      ? summarizeProjectFinancials({
          projectValue: project.projectValue,
          invoices: project.invoices,
          receipts: project.receipts,
          purchaseBills: project.purchaseBills,
          paymentRequests: project.paymentRequests,
        })
      : null;

  const overdueInvoiceCount = can(user, "invoice.read")
    ? project.invoices.filter((inv) => {
        if (inv.status !== "SENT" && inv.status !== "PART_PAID" && inv.status !== "OVERDUE") {
          return false;
        }
        if (!inv.dueDate) return false;
        return inv.dueDate < today;
      }).length
    : null;

  const omittedChapters: Parameters<
    typeof buildProjectCommandDashboardSpine
  >[0]["omittedChapters"] = {};

  if (taskOpen == null) {
    omittedChapters!.tasks = {
      omitted: true,
      omitReason: "Missing task.read.self (and related task scopes).",
    };
  }
  if (!can(user, "salesorder.read")) {
    omittedChapters!.sales_orders = {
      omitted: true,
      omitReason: "Missing salesorder.read",
    };
  }
  if (purchaseOrderCount == null) {
    omittedChapters!.purchase_orders = {
      omitted: true,
      omitReason: "Missing purchaseorder.read",
    };
  }
  if (!can(user, "delivery.read")) {
    omittedChapters!.deliveries = {
      omitted: true,
      omitReason: "Missing delivery.read",
    };
  }
  if (!can(user, "invoice.read")) {
    omittedChapters!.invoices = {
      omitted: true,
      omitReason: "Missing invoice.read",
    };
    omittedChapters!.overdue = {
      omitted: true,
      omitReason: "Missing invoice.read",
    };
  }
  if (!can(user, "receipt.read")) {
    omittedChapters!.cash = {
      omitted: true,
      omitReason: "Missing receipt.read",
    };
  }

  const spine = buildProjectCommandDashboardSpine({
    project: {
      id: project.id,
      projectId: project.projectId,
      projectName: project.projectName,
      status: project.status,
      customerName: project.customer?.customerName ?? null,
    },
    counts: {
      taskOpen: taskOpen ?? 0,
      checklistOpen,
      salesOrderCount: can(user, "salesorder.read") ? project.salesOrders.length : 0,
      purchaseOrderCount: purchaseOrderCount ?? 0,
      deliveryCount: can(user, "delivery.read") ? project.deliveries.length : 0,
      invoiceCount: can(user, "invoice.read") ? project.invoices.length : 0,
      overdueInvoiceCount: overdueInvoiceCount ?? 0,
      invoicedTotal: showInvoiced && fin ? fin.invoiced : null,
      receivedTotal: showPayments && fin ? fin.received : null,
      outstandingTotal: showInvoiced && fin ? fin.outstanding : null,
      invoiceOutstandingTotal: showInvoiced && fin ? fin.invoiceOutstanding : null,
      customerCreditTotal: showInvoiced && fin ? fin.customerCredit : null,
      projectValue: showValue ? n(project.projectValue) : null,
      budget: showBudget ? n(project.budget) : null,
    },
    omittedChapters,
  });

  return { ok: true, spine };
}
