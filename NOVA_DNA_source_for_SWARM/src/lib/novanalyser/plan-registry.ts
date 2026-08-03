/**
 * NovANALYSER plan templates — bounded fan-out per intent (P0: business_health + productivity_self).
 */
import type { SessionUser } from "@/auth";
import type { Permission } from "@/lib/rbac";
import { novaCanRunTool } from "@/lib/ai/nova-suggest";
import type {
  NovAnalyserIntent,
  NovAnalyserPlan,
  NovAnalyserPlanStep,
  NovAnalyserProfile,
} from "@/lib/novanalyser/types";

const MAX_STEPS_P0 = 10;

type PlanTemplate = {
  planId: string;
  steps: NovAnalyserPlanStep[];
  profiles: NovAnalyserProfile[];
};

const PLAN_TEMPLATES: Record<
  Extract<NovAnalyserIntent, "business_health" | "productivity_self">,
  PlanTemplate
> = {
  business_health: {
    planId: "business_health_v1",
    profiles: ["director", "manager", "accountant"],
    steps: [
      { moduleId: "finance.sales", toolId: "sales_summary", label: "Sales" },
      { moduleId: "finance.receipts", toolId: "receipts_summary", label: "Receipts" },
      { moduleId: "finance.ar", toolId: "receivables_summary", label: "Receivables" },
      { moduleId: "finance.overdue", toolId: "overdue_invoices", label: "Overdue invoices" },
      { moduleId: "ops.projects", toolId: "projects_summary", label: "Projects" },
      { moduleId: "ops.delivery", toolId: "delivery_summary", label: "Delivery" },
      { moduleId: "ops.approvals", toolId: "approvals_summary", label: "Approvals" },
      { moduleId: "ops.stock", toolId: "stock_summary", label: "Stock" },
      {
        moduleId: "finance.director",
        toolId: "director_dashboard_summary",
        label: "Director dashboard",
      },
      { moduleId: "ops.kpi", toolId: "kpi_summary", label: "KPI" },
    ],
  },
  productivity_self: {
    planId: "productivity_self_v1",
    profiles: ["staff", "manager", "director", "accountant"],
    steps: [
      { moduleId: "ops.my_work", toolId: "my_work_summary", label: "My work" },
      { moduleId: "ops.kpi_self", toolId: "kpi_summary", label: "My KPI" },
      { moduleId: "hr.attendance_self", toolId: "attendance_late_summary", label: "Attendance" },
      { moduleId: "hr.leave_self", toolId: "leave_summary", label: "Leave" },
      { moduleId: "ops.tasks_self", toolId: "tasks_summary", label: "Tasks" },
    ],
  },
};

const DEFERRED_INTENTS: NovAnalyserIntent[] = [
  "productivity_team",
  "delivery_risk",
  "cash_flow",
  "kpi_trends",
];

export function buildNovAnalyserPlan(input: {
  user: SessionUser;
  intent: NovAnalyserIntent;
  profile: NovAnalyserProfile;
  periodLabel?: string;
}): NovAnalyserPlan | null {
  const { user, intent, profile } = input;
  const periodLabel = input.periodLabel ?? "current period";

  if (DEFERRED_INTENTS.includes(intent)) {
    return null;
  }

  if (intent !== "business_health" && intent !== "productivity_self") {
    return null;
  }

  const template = PLAN_TEMPLATES[intent];
  if (!template.profiles.includes(profile) && intent === "business_health") {
    // Staff cannot run org business health — plan builder returns empty with skips.
    if (profile === "staff") {
      return {
        planId: template.planId,
        profile,
        intent,
        steps: [],
        permissionsRequired: ["ai.assistant.read"],
        skippedModules: template.steps.map((s) => ({
          moduleId: s.moduleId,
          reason: "rbac" as const,
        })),
        periodLabel,
      };
    }
  }

  const steps: NovAnalyserPlanStep[] = [];
  const skippedModules: NovAnalyserPlan["skippedModules"] = [];
  const permissionsUsed = new Set<Permission>(["ai.assistant.read"]);

  for (const step of template.steps.slice(0, MAX_STEPS_P0)) {
    if (novaCanRunTool(user, step.toolId)) {
      steps.push(step);
    } else {
      skippedModules.push({ moduleId: step.moduleId, reason: "rbac" });
    }
  }

  return {
    planId: template.planId,
    profile,
    intent,
    steps,
    permissionsRequired: [...permissionsUsed],
    skippedModules,
    periodLabel,
  };
}

export function listNovAnalyserPlanToolIds(plan: NovAnalyserPlan): string[] {
  return plan.steps.map((s) => s.toolId);
}
