/**
 * NovANALYSER — cross-module analytics orchestrator types (P0).
 */
import type { Permission } from "@/lib/rbac";
import type { NovaFinding } from "@/lib/nova/recipes/finding";

export type NovAnalyserIntent =
  | "business_health"
  | "productivity_self"
  | "productivity_team"
  | "delivery_risk"
  | "cash_flow"
  | "kpi_trends"
  | "unknown";

export type NovAnalyserProfile = "director" | "manager" | "accountant" | "staff";

export type NovAnalyserPlanStep = {
  moduleId: string;
  toolId: string;
  label: string;
};

export type NovAnalyserPlan = {
  planId: string;
  profile: NovAnalyserProfile;
  intent: NovAnalyserIntent;
  steps: NovAnalyserPlanStep[];
  permissionsRequired: Permission[];
  skippedModules: Array<{ moduleId: string; reason: "rbac" | "disabled" }>;
  periodLabel: string;
};

export type NovAnalyserMetricSnapshot = {
  metricId: string;
  value: number | string | null;
  unit?: string;
  period?: string | null;
  toolId: string;
  moduleId?: string;
  severityHint?: "critical" | "high" | "medium" | "low";
  entityScope?: "org" | "team" | "self";
  moneyHidden?: boolean;
};

export type NovAnalyserIssueSeverity = "critical" | "high" | "medium" | "low";

export type NovAnalyserIssue = {
  id: string;
  title: string;
  severity: NovAnalyserIssueSeverity;
  score: number;
  observation: string;
  evidence: NovaFinding["evidence"];
  contributors: Array<{ toolId: string; metricId?: string; moduleId?: string }>;
  recommendations: Array<{ label: string; href: string }>;
  correlationRuleId?: string;
  confidence: "fact" | "supported_inference";
  finding: NovaFinding;
  financialExposureInr?: number;
  countImpact?: number;
};

export type NovAnalyserResult = {
  planId: string;
  intent: NovAnalyserIntent;
  profile: NovAnalyserProfile;
  headline: string;
  deterministicNarrative: string;
  issues: NovAnalyserIssue[];
  findingsFormatted: string;
  metrics: NovAnalyserMetricSnapshot[];
  skippedModules: NovAnalyserPlan["skippedModules"];
  completeness: "full" | "partial";
  saveReportStub?: { packId: string; note: string };
};
