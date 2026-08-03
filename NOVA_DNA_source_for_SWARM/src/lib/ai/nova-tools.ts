import type { SessionUser } from "@/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  parseNovaDateRange,
  type DateRange,
  isNovaSingleDayRange,
  isNovaBarePeriodOnlyAsk,
} from "@/lib/ai/nova-dates";
import { applyNovaOpenToolFallbacks, filterNovaToolsForUser } from "@/lib/ai/nova-suggest";
import { selectToolsFromLexicon, extractNovaEntityHint, extractNovaPersonHint, extractNovaBareEntityCandidate, isNovaConfirmedOrdersAsk } from "@/lib/ai/nova-lexicon";
import { composeNovaIntent, novaIntentIsDecisive } from "@/lib/ai/nova-intent";
import { recipeMatchesQuery } from "@/lib/nova/recipes/registry";
import {
  HOW_IS_FRAME,
  looksLikePartyOrProjectName,
  novaSearchEngineIsDecisive,
  runNovaSearchEngine,
} from "@/lib/nova/nova-search-engine";
import {
  looksLikeSingleTokenPartyLabel,
  normalizeNovaEntityLookupHint,
  looksLikeHardPartyOrProjectName,
} from "@/lib/nova/party-name";
import {
  parseNovaEntityRoleSpan,
  preferTypesForKindHint,
  shouldClarifyMixedEntityTypes,
  refuseSilentOrgWide,
  parseEntityModuleAsk,
  pickNovaQueryDepth,
  toolsImplyPartyScope,
  classifyQiAskOutcome,
  recordQiCrumb,
  isNovaTaskCompletionRankingAsk,
  isNovaPersonTaskFallbackAsk,
  isNovaPlaceFramedTaskAsk,
  isNovaRankingWhEntityNoise,
  isNovaLeadingPersonFocusTaskAsk,
  isNovaPersonalTaskAskShape,
  collapseRelatedCustomerChildProjects,
  pickExactNamedProject,
  normalizePartyHint,
  type HierarchyPartyCand,
} from "@/lib/nova/query-structure";
import { isNovaNonReferentialName } from "@/lib/ai/nova-inference";
import { DEFAULT_TIMEZONE } from "@/lib/datetime-pure";
import {
  buildEntityClarifyCard,
  buildPersonClarifyCard,
  formatNovaClarifyCard,
  type NovaClarifyOption,
} from "@/lib/ai/nova-clarify";
import { dispatchNovaSkill, hasNovaSkill } from "@/lib/nova/skills/registry";
import { queryNamesEntity360 } from "@/lib/nova/entity-360/recognize";
import { isNovaAnalysisCue, isNonAttendanceLateContext } from "@/lib/nova/analysis/domain";
import { isNovaTrendCue } from "@/lib/nova/trend/domain";
import type { NovaToolFact, NovaToolLink, NovaToolPack } from "@/lib/nova/core/tool-types";
import {
  novaLeaveAccessMode,
  novaPurchaseBillPendingScope,
  novaTaskAccessMode,
} from "@/lib/ai/nova-access";

export type { NovaToolFact, NovaToolLink, NovaToolPack };
export { novaLeaveAccessMode, novaPurchaseBillPendingScope, novaTaskAccessMode };

/**
 * Pure KPI/person tool refine — keep Analysis exclusive of kpi_summary dump.
 * Exported for regression tests (named “kpi analysis of X”).
 */
export function refineNovaPersonKpiTools(selected: string[], query: string): string[] {
  const q = query.toLowerCase();
  // Structured report-card only — bare “kpi report” / “kpi trend report” stay on summary/trend packs.
  const reportCardCue =
    /\b(kpi\s+report\s+card|report\s*card\s+kpi|kpi\s+breakdown|kpi\s+scorecard)\b/i.test(
      q
    );
  if (isNovaAnalysisCue(query) || selected.includes("nova_analysis")) {
    return [
      ...selected.filter(
        (t) => t !== "search_entities" && t !== "kpi_summary" && t !== "kpi_report"
      ),
      ...(selected.includes("nova_analysis") ? [] : ["nova_analysis"]),
    ];
  }
  if (reportCardCue || selected.includes("kpi_report")) {
    return [
      ...selected.filter(
        (t) => t !== "search_entities" && t !== "kpi_summary" && t !== "nova_analysis"
      ),
      ...(selected.includes("kpi_report") ? [] : ["kpi_report"]),
    ];
  }
  if (/\bkpi\b/i.test(q) && !selected.includes("kpi_summary")) {
    return [...selected.filter((t) => t !== "search_entities"), "kpi_summary"];
  }
  return selected;
}

export type NovaResolvedPerson = {
  name: string;
  relation: "self" | "other";
  userId: string | null;
  staffId: string | null;
  staffCode: string | null;
  resolved: true;
};

export type NovaPersonResolveResult =
  | { kind: "ok"; person: NovaResolvedPerson }
  | {
      kind: "ambiguous";
      name: string;
      message: string;
      options: NovaClarifyOption[];
    }
  | { kind: "not_found"; name: string; message: string };

function canListNovaStaff(sessionUser: SessionUser): boolean {
  return (
    can(sessionUser, "staff.read") ||
    can(sessionUser, "hr.employee.read") ||
    can(sessionUser, "hr.attendance.read") ||
    can(sessionUser, "hr.attendance.team") ||
    can(sessionUser, "hr.leave.read") ||
    can(sessionUser, "kpi.read.team") ||
    can(sessionUser, "kpi.read.all") ||
    can(sessionUser, "task.edit.team") ||
    can(sessionUser, "task.reports.read")
  );
}

/** Resolve a free-text person hint to staff/user (shared by tasks / leave / KPI / etc.). */
export async function resolveNovaPersonHint(
  personHint: string,
  sessionUser: SessionUser
): Promise<NovaPersonResolveResult> {
  if (!canListNovaStaff(sessionUser) && sessionUser.role !== "SUPER_ADMIN" && sessionUser.role !== "ADMIN") {
    // Self-only users may still resolve their own name
    const selfStaff = await prisma.staffProfile.findFirst({
      where: { userId: sessionUser.id },
      select: { id: true, fullName: true, staffCode: true, userId: true },
    });
    if (
      selfStaff &&
      (selfStaff.fullName.toLowerCase() === personHint.toLowerCase() ||
        selfStaff.staffCode?.toLowerCase() === personHint.toLowerCase() ||
        selfStaff.fullName.toLowerCase().includes(personHint.toLowerCase()))
    ) {
      return {
        kind: "ok",
        person: {
          name: selfStaff.fullName,
          relation: "self",
          userId: selfStaff.userId,
          staffId: selfStaff.id,
          staffCode: selfStaff.staffCode,
          resolved: true,
        },
      };
    }
    return {
      kind: "not_found",
      name: personHint,
      message: `No staff member matching “${personHint}” was found (or you lack access to staff directory).`,
    };
  }

  const staffMatches = await prisma.staffProfile.findMany({
    where: {
      OR: [
        { fullName: { contains: personHint, mode: "insensitive" } },
        { staffCode: { equals: personHint, mode: "insensitive" } },
      ],
    },
    select: { id: true, fullName: true, staffCode: true, userId: true },
    take: 8,
  });
  const exact =
    staffMatches.find((s) => s.fullName.toLowerCase() === personHint.toLowerCase()) ??
    staffMatches.find((s) => s.staffCode?.toLowerCase() === personHint.toLowerCase()) ??
    (staffMatches.length === 1 ? staffMatches[0] : null);

  if (!exact && staffMatches.length > 1) {
    const card = buildPersonClarifyCard(
      personHint,
      staffMatches.slice(0, 5).map((s) => ({
        id: s.id,
        label: s.fullName,
        type: "staff" as const,
        code: s.staffCode,
      }))
    );
    return {
      kind: "ambiguous",
      name: personHint,
      message: formatNovaClarifyCard(card),
      options: card.options,
    };
  }

  if (exact) {
    const isSelf = exact.userId === sessionUser.id;
    return {
      kind: "ok",
      person: {
        name: exact.fullName,
        relation: isSelf ? "self" : "other",
        userId: exact.userId,
        staffId: exact.id,
        staffCode: exact.staffCode,
        resolved: true,
      },
    };
  }

  const userMatches = await prisma.user.findMany({
    where: { name: { contains: personHint, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      staffProfile: { select: { id: true, fullName: true, staffCode: true } },
    },
    take: 5,
  });
  const uExact =
    userMatches.find((u) => (u.name ?? "").toLowerCase() === personHint.toLowerCase()) ??
    (userMatches.length === 1 ? userMatches[0] : null);
  if (!uExact) {
    return {
      kind: "not_found",
      name: personHint,
      message: `No staff member matching “${personHint}” was found. Check the name/spelling.`,
    };
  }
  if (userMatches.length > 1 && !userMatches.find((u) => (u.name ?? "").toLowerCase() === personHint.toLowerCase())) {
    const card = buildPersonClarifyCard(
      personHint,
      userMatches.slice(0, 5).map((u) => ({
        id: u.staffProfile?.id ?? u.id,
        label: u.staffProfile?.fullName ?? u.name ?? "?",
        type: "staff" as const,
        code: u.staffProfile?.staffCode,
      }))
    );
    return {
      kind: "ambiguous",
      name: personHint,
      message: formatNovaClarifyCard(card),
      options: card.options,
    };
  }
  const isSelf = uExact.id === sessionUser.id;
  return {
    kind: "ok",
    person: {
      name: uExact.staffProfile?.fullName ?? uExact.name ?? personHint,
      relation: isSelf ? "self" : "other",
      userId: uExact.id,
      staffId: uExact.staffProfile?.id ?? null,
      staffCode: uExact.staffProfile?.staffCode ?? null,
      resolved: true,
    },
  };
}

/** Exact bind from ClarifyAct — by DB id or type+code only (never fuzzy name). */
export async function lookupNovaEntityByBound(
  bound: {
    id: string;
    type: "customer" | "vendor" | "project";
    code?: string | null;
    label?: string;
  },
  sessionUser?: SessionUser
): Promise<{
  type: "customer" | "vendor" | "project";
  id: string;
  code: string;
  name: string;
} | null> {
  const allowCustomer =
    !sessionUser ||
    sessionUser.role === "SUPER_ADMIN" ||
    sessionUser.role === "ADMIN" ||
    can(sessionUser, "customer.read");
  const allowVendor =
    !sessionUser ||
    sessionUser.role === "SUPER_ADMIN" ||
    sessionUser.role === "ADMIN" ||
    can(sessionUser, "vendor.read");
  const allowProject =
    !sessionUser ||
    sessionUser.role === "SUPER_ADMIN" ||
    sessionUser.role === "ADMIN" ||
    can(sessionUser, "project.read");

  if (bound.type === "customer" && allowCustomer) {
    const row = await prisma.customer.findFirst({
      where: {
        OR: [
          { id: bound.id },
          ...(bound.code ? [{ customerId: { equals: bound.code, mode: "insensitive" as const } }] : []),
          // History parse uses code as id
          { customerId: { equals: bound.id, mode: "insensitive" } },
        ],
      },
      select: { id: true, customerId: true, customerName: true, companyName: true },
    });
    if (row) {
      return {
        type: "customer",
        id: row.id,
        code: row.customerId,
        name: row.customerName || row.companyName || row.customerId,
      };
    }
  }
  if (bound.type === "vendor" && allowVendor) {
    const row = await prisma.vendor.findFirst({
      where: {
        OR: [
          { id: bound.id },
          ...(bound.code ? [{ vendorId: { equals: bound.code, mode: "insensitive" as const } }] : []),
          { vendorId: { equals: bound.id, mode: "insensitive" } },
        ],
      },
      select: { id: true, vendorId: true, vendorName: true },
    });
    if (row) {
      return {
        type: "vendor",
        id: row.id,
        code: row.vendorId,
        name: row.vendorName,
      };
    }
  }
  if (bound.type === "project" && allowProject) {
    const row = await prisma.project.findFirst({
      where: {
        OR: [
          { id: bound.id },
          ...(bound.code ? [{ projectId: { equals: bound.code, mode: "insensitive" as const } }] : []),
          { projectId: { equals: bound.id, mode: "insensitive" } },
        ],
      },
      select: { id: true, projectId: true, projectName: true },
    });
    if (row) {
      return {
        type: "project",
        id: row.id,
        code: row.projectId,
        name: row.projectName,
      };
    }
  }
  return null;
}

/** Resolve a free-text entity hint to customer / vendor / project. */
export type NovaEntityResolveResult =
  | {
      kind: "ok";
      entity: {
        type: "customer" | "vendor" | "project";
        id: string;
        code: string;
        name: string;
      };
    }
  | {
      kind: "ambiguous";
      name: string;
      message: string;
      options: NovaClarifyOption[];
    }
  | { kind: "not_found"; name: string; message: string }
  | { kind: "skip" };

/** Money / salary / bank asks must not silent-bind a soft `contains` hit. */
export function isNovaSensitiveEntityResolveQuery(
  query: string,
  selectedTools?: string[]
): boolean {
  const q = query.trim();
  if (
    /\b(sales|revenue|receipts?|collections?|invoices?|billing|outstanding|receivables?|payables?|salary|payroll|payslips?|bank\s+balance|bank\s+accounts?|profitability|order\s*book)\b/i.test(
      q
    )
  ) {
    return true;
  }
  if (!selectedTools?.length) return false;
  const SENSITIVE_TOOLS = new Set([
    "sales_summary",
    "receipts_summary",
    "overdue_invoices",
    "receivables_summary",
    "customer_outstanding",
    "payables_summary",
    "profitability_summary",
    "bank_accounts_summary",
    "order_book_summary",
    "director_dashboard_summary",
    "salary_summary",
    "payroll_summary",
    "payslip_summary",
    "incentives_summary",
    "advances_summary",
    "collection_attention",
  ]);
  return selectedTools.some((t) => SENSITIVE_TOOLS.has(t));
}

export async function resolveNovaEntityHint(
  entityHint: string,
  sessionUser?: SessionUser,
  opts?: {
    preferTypes?: Array<"customer" | "vendor" | "project">;
    /** When true, never silent-bind a single soft contains hit (money/salary/bank). */
    sensitiveMoney?: boolean;
    /**
     * When true, soft multi-type party resolves may also surface staff chips
     * (Customer vs Project vs Staff) — never silent-bind staff for party-shaped hints.
     */
    includeStaff?: boolean;
  }
): Promise<NovaEntityResolveResult> {
  const hint = normalizeNovaEntityLookupHint(entityHint);
  if (!hint || hint.length < 2) return { kind: "skip" };

  const allowCustomer =
    !sessionUser ||
    sessionUser.role === "SUPER_ADMIN" ||
    sessionUser.role === "ADMIN" ||
    can(sessionUser, "customer.read");
  const allowVendor =
    !sessionUser ||
    sessionUser.role === "SUPER_ADMIN" ||
    sessionUser.role === "ADMIN" ||
    can(sessionUser, "vendor.read");
  const allowProject =
    !sessionUser ||
    sessionUser.role === "SUPER_ADMIN" ||
    sessionUser.role === "ADMIN" ||
    can(sessionUser, "project.read");

  const [customers, vendors, projects] = await Promise.all([
    allowCustomer
      ? prisma.customer.findMany({
          where: {
            OR: [
              { customerName: { contains: hint, mode: "insensitive" } },
              { companyName: { contains: hint, mode: "insensitive" } },
              { customerId: { equals: hint, mode: "insensitive" } },
            ],
          },
          select: { id: true, customerId: true, customerName: true, companyName: true },
          take: 6,
        })
      : Promise.resolve([]),
    allowVendor
      ? prisma.vendor.findMany({
          where: {
            OR: [
              { vendorName: { contains: hint, mode: "insensitive" } },
              { vendorId: { equals: hint, mode: "insensitive" } },
            ],
          },
          select: { id: true, vendorId: true, vendorName: true },
          take: 6,
        })
      : Promise.resolve([]),
    allowProject
      ? prisma.project.findMany({
          where: {
            OR: [
              { projectName: { contains: hint, mode: "insensitive" } },
              { projectId: { contains: hint, mode: "insensitive" } },
            ],
          },
          select: { id: true, projectId: true, projectName: true, customerId: true },
          take: 6,
        })
      : Promise.resolve([]),
  ]);

  type Cand = HierarchyPartyCand;
  const cands: Cand[] = [
    ...customers.map((c) => ({
      type: "customer" as const,
      id: c.id,
      code: c.customerId,
      name: (c.customerName || c.companyName || c.customerId || "").trim().replace(/\s+/g, " "),
    })),
    ...vendors.map((v) => ({
      type: "vendor" as const,
      id: v.id,
      code: v.vendorId,
      name: (v.vendorName || "").trim().replace(/\s+/g, " "),
    })),
    ...projects.map((p) => ({
      type: "project" as const,
      id: p.id,
      code: p.projectId,
      name: (p.projectName || "").trim().replace(/\s+/g, " "),
      customerDbId: p.customerId,
    })),
  ].filter((c) => !opts?.preferTypes?.length || opts.preferTypes.includes(c.type));

  // Exact ID / exact name first (never silent multi-match). Normalize whitespace.
  const hintNorm = normalizePartyHint(hint);
  const exact =
    cands.find((c) => c.code.toLowerCase() === hintNorm) ??
    cands.find((c) => normalizePartyHint(c.name) === hintNorm) ??
    null;

  if (exact) {
    return { kind: "ok", entity: exact };
  }

  // Confirmed aliases only (drafts never bind). Multi-alias → clarify.
  const { findConfirmedNovaAliases } = await import("@/lib/nova/semantic/aliases");
  const allowedAliasTypes: Array<"customer" | "vendor" | "project"> = [];
  if (allowCustomer) allowedAliasTypes.push("customer");
  if (allowVendor) allowedAliasTypes.push("vendor");
  if (allowProject) allowedAliasTypes.push("project");
  const aliasHits = (await findConfirmedNovaAliases(hint, { entityTypes: allowedAliasTypes })).filter(
    (h) => h.entityType !== "employee"
  );

  if (aliasHits.length === 1) {
    const a = aliasHits[0]!;
    const fromCand = cands.find((c) => c.id === a.targetId && c.type === a.entityType);
    return {
      kind: "ok",
      entity: fromCand ?? {
        type: a.entityType as "customer" | "vendor" | "project",
        id: a.targetId,
        code: a.targetCode ?? a.targetId,
        name: a.targetName ?? a.alias,
      },
    };
  }
  if (aliasHits.length > 1) {
    const card = buildEntityClarifyCard(
      hint,
      aliasHits.slice(0, 5).map((a) => ({
        id: a.targetId,
        label: a.targetName ?? a.alias,
        type: a.entityType as "customer" | "vendor" | "project",
        code: a.targetCode ?? "",
      }))
    );
    return {
      kind: "ambiguous",
      name: hint,
      message: formatNovaClarifyCard(card),
      options: card.options,
    };
  }

  if (cands.length === 0) {
    if (isNovaNonReferentialName(hint) || HOW_IS_FRAME.test(hint)) {
      return {
        kind: "not_found",
        name: hint,
        message:
          "I don’t treat that as a company name. Try **how is business**, **how is sales**, **how is cash this week**, or **find customer …**.",
      };
    }
    return {
      kind: "not_found",
      name: hint,
      message: `No customer, vendor, or project matching “${hint}” was found. If you meant a staff member’s tasks, try **${hint} pending tasks** or **tasks for ${hint}**. Otherwise check the name/spelling.`,
    };
  }

  const staffForClarify = opts?.includeStaff
    ? await loadStaffClarifyCandidates(hint, sessionUser)
    : [];

  const toClarify = (
    partyRows: Cand[],
    staffRows: Array<{ id: string; label: string; code: string | null }>
  ): NovaEntityResolveResult => {
    const card = buildEntityClarifyCard(hint, [
      ...partyRows.slice(0, 5).map((c) => ({
        id: c.id,
        label: c.name,
        type: c.type,
        code: c.code,
      })),
      ...staffRows.slice(0, Math.max(0, 5 - Math.min(partyRows.length, 5))).map((s) => ({
        id: s.id,
        label: s.label,
        type: "staff" as const,
        code: s.code,
      })),
    ]);
    return {
      kind: "ambiguous",
      name: hint,
      message: formatNovaClarifyCard(card),
      options: card.options,
    };
  };

  // Soft contains hit(s): money/salary/bank never silent-bind — always clarify.
  if (opts?.sensitiveMoney) {
    return toClarify(cands, staffForClarify);
  }

  // Unique project name equals hint → bind project (even if parent soft-matches).
  const exactProject = pickExactNamedProject(hint, cands);
  if (exactProject) {
    return { kind: "ok", entity: exactProject };
  }

  // Parent customer + own child projects (C0026 vs C0026-P001) → bind customer.
  // Module-wide: tasks / invoices / outstanding / receipts all share this resolve.
  const family = collapseRelatedCustomerChildProjects(hint, cands);
  if (family) {
    return { kind: "ok", entity: family };
  }

  // Mixed entity types (Customer vs Project vs Staff) → clarify chips, never guess.
  const partyTypes = new Set(cands.map((c) => c.type));
  const mixedTypes = shouldClarifyMixedEntityTypes(partyTypes, {
    staffCandidateCount: staffForClarify.length,
  });

  if (cands.length === 1 && !mixedTypes) {
    return { kind: "ok", entity: cands[0]! };
  }

  // Ranked fuzzy still clarifies on multi-match — never silent pick.
  if (cands.length > 1 || mixedTypes) {
    return toClarify(cands, staffForClarify);
  }

  return {
    kind: "not_found",
    name: hint,
    message:
      isNovaNonReferentialName(hint) || HOW_IS_FRAME.test(hint)
        ? "I don’t treat that as a company name. Try **how is business**, **how is sales**, **how is cash this week**, or **find customer …**."
        : `No customer, vendor, or project matching “${hint}” was found. If you meant a staff member’s tasks, try **${hint} pending tasks** or **tasks for ${hint}**. Otherwise check the name/spelling.`,
  };
}

/** Soft staff rows for typed Customer/Project/Staff clarify (never auto-bind). */
async function loadStaffClarifyCandidates(
  hint: string,
  sessionUser?: SessionUser
): Promise<Array<{ id: string; label: string; code: string | null }>> {
  if (!sessionUser) return [];
  if (
    sessionUser.role !== "SUPER_ADMIN" &&
    sessionUser.role !== "ADMIN" &&
    !canListNovaStaff(sessionUser)
  ) {
    return [];
  }
  const staffMatches = await prisma.staffProfile.findMany({
    where: {
      OR: [
        { fullName: { contains: hint, mode: "insensitive" } },
        { staffCode: { equals: hint, mode: "insensitive" } },
      ],
    },
    select: { id: true, fullName: true, staffCode: true },
    take: 4,
  });
  return staffMatches.map((s) => ({
    id: s.id,
    label: s.fullName,
    code: s.staffCode,
  }));
}

/** Bookkeeping / FY adjustment rows that must not dominate “largest project”. */
export function isNovaBookkeepingProjectName(name: string): boolean {
  const lower = name.toLowerCase();
  if (/\badjustment\b/.test(lower)) return true;
  if (/\bfy\s*['’]?\d{2}/.test(lower) && /\b(adjust|opening|closing|book\s*keep|carry\s*forward)\b/.test(lower)) {
    return true;
  }
  return false;
}

/** Which tools to run for a free-form query (lexicon + heuristics; read-only). */
export function selectNovaTools(query: string): string[] {
  // Specific record code (e.g. payment request C0028-P001-E002 / OTH/26-27/0011)
  // → cross-module Entity 360, ahead of recipes / search / lexicon. RBAC + record
  // scoping are enforced inside the skill.
  if (queryNamesEntity360(query)) {
    return ["entity_360"];
  }

  // Sales Orders documents vs project “orders” — before recipes / SearchEngine
  {
    const q = query.trim().toLowerCase();
    if (
      /\bsales\s+orders?\b/.test(q) ||
      /\bso\s+pending\b/.test(q) ||
      /\bopen\s+sales\s+orders?\b/.test(q)
    ) {
      return ["sales_orders_summary"];
    }
  }
  if (isNovaConfirmedOrdersAsk(query)) {
    return ["projects_summary"];
  }

  // Bounded recipes win when phrase matches (registered skills only).
  // Depth picker: Analysis / Trend / pack cues align recipe vs thin skills.
  const depth = pickNovaQueryDepth(query);
  const recipeId = recipeMatchesQuery(query);
  if (recipeId) {
    // Thin depth + named-project + bare tasks → prefer thin tasks when SE is decisive tasks-scoped
    if (
      depth === "thin" &&
      recipeId === "project_command" &&
      /\b(tasks?|todos?)\b/i.test(query) &&
      !/\b(everything|photos?|pictures?|images?|deep\s*dive|command)\b/i.test(query)
    ) {
      const searchThin = runNovaSearchEngine(query);
      if (
        searchThin.tools.includes("tasks_summary") &&
        searchThin.entityHint &&
        novaSearchEngineIsDecisive(searchThin)
      ) {
        return ["tasks_summary"];
      }
    }
    // Named / Project Command + photos → also documents_search (RBAC-gated skill)
    if (
      recipeId === "project_command" &&
      /\b(photos?|pictures?|images?|attachments?|site\s+images?|plant\s+photos?)\b/i.test(query)
    ) {
      return ["project_command", "documents_search"];
    }
    return [recipeId];
  }

  // Vague finance report → clarify menu (no tools until user picks)
  if (/^finance\s+reports?$/i.test(query.trim()) || /^financial\s+reports?$/i.test(query.trim())) {
    return [];
  }

  // “staff Arif” / “employee Zeeshan” → HR staff profile (never sticky receipts party)
  // Do not steal metric phrases: “staff expenses”, “staff advances”, “staff list”, …
  if (
    /^(?:staff|employee)\s+[A-Za-z]/i.test(query.trim()) &&
    !/^(?:staff|employee)\s+(expenses?|advances?|list|directory|count|headcount|kpi|summary|attendance|leave|salary|payroll|incentives?)\b/i.test(
      query.trim()
    )
  ) {
    return ["staff_summary"];
  }
  // “who is Arun” → staff profile (attendance WH handled by lexicon later)
  if (
    /^(?:who\s+(?:is|are)|who's)\s+(?!late\b|absent\b|present\b|most\b)([A-Za-z])/i.test(
      query.trim()
    )
  ) {
    const searchWho = runNovaSearchEngine(query);
    if (
      searchWho.queryFamily === "people" &&
      searchWho.tools.includes("staff_summary")
    ) {
      return ["staff_summary"];
    }
  }

  // Analysis: specialized cues win; bare depth “why” still routes to Analysis except
  // money/ops late (“why late payment / invoices / delivery”) which must stay thin.
  if (
    isNovaAnalysisCue(query) ||
    (depth === "analysis" &&
      !(/\b(?:late|delay|delayed)\b/i.test(query) && isNonAttendanceLateContext(query)))
  ) {
    return ["nova_analysis"];
  }

  // Trend cues (frequency / over time) — after Analysis so “why late” stays Analysis
  if (isNovaTrendCue(query) || depth === "trend") {
    return ["nova_trend"];
  }

  // Soft personal-task paraphrases beat SE name-search / entity resolve
  // (hard party names like James School stay on SE party path).
  if (
    !isNovaPlaceFramedTaskAsk(query) &&
    (isNovaLeadingPersonFocusTaskAsk(query) || isNovaPersonalTaskAskShape(query)) &&
    extractNovaPersonHint(query) &&
    !looksLikeHardPartyOrProjectName(query)
  ) {
    return ["tasks_summary"];
  }

  // Delivery / installation scoped asks often contain hard project/customer IDs.
  // Let the delivery lexicon win before generic entity search resolves the ID only.
  if (
    /\b(deliver(?:y|ies|ed)?|dispatch(?:es|ed)?|shipped|install(?:ation|ations|ed|ing)?|technicians?)\b/i.test(
      query
    )
  ) {
    const lexicon = selectToolsFromLexicon(query);
    if (lexicon.tools.includes("delivery_summary")) {
      return ["delivery_summary"];
    }
  }

  // Staff finance asks are metric questions, not generic staff profile search.
  if (
    /\b(staff|employee|employees?)\b/i.test(query) &&
    /\b(advances?|advance\s+balance|settlement)\b/i.test(query) &&
    !/\b(expenses?|reimburs\w*|claims?|spend|spent)\b/i.test(query)
  ) {
    return ["staff_advances_summary"];
  }
  if (
    /\b(reimburs\w*|expense\s+claims?|staff\s+spend|spends?|spent|staff[-\s]?wise\s+expense|employee\s+expense|top\s+claimants?)\b/i.test(
      query
    ) ||
    (/\b(staff|employee|employees?)\b/i.test(query) &&
      /\b(expenses?|kharcha|claims?|spend|spent)\b/i.test(query))
  ) {
    return ["staff_expense_summary"];
  }

  // NovaSearchEngine — name lookup / entity-scoped status before wrong skill defaults.
  // Resolve must not override a lexicon topic that already has real skills
  // (e.g. “finance report” / “reports” → reports_snapshot, not search_entities).
  {
    const search = runNovaSearchEngine(query);
    if (novaSearchEngineIsDecisive(search) && search.tools.length > 0) {
      if (search.queryFamily === "resolve") {
        const lexicon = selectToolsFromLexicon(query);
        const lexiconTools = lexicon.tools.filter((t) => t !== "search_entities");
        if (lexiconTools.length > 0) {
          // Fall through to lexicon / intent / recipes below
        } else {
          return [...search.tools];
        }
      } else {
        return [...search.tools];
      }
    }
  }

  // KPI report card dump (structured factors) — not LLM Analysis.
  // Bare “kpi report” / “kpi trend report” use kpi_summary / nova_trend pack path.
  if (
    /\b(kpi\s+report\s+card|report\s*card\s+kpi|kpi\s+breakdown)\b/i.test(query)
  ) {
    return ["kpi_report"];
  }

  // Phase F — proactive insight queue (read-only)
  if (
    /\b(proactive\s+insights?|insight\s+cards?|what\s+needs\s+attention|attention\s+queue|needs\s+attention|exceptions?\s+queue)\b/i.test(
      query
    )
  ) {
    return ["proactive_insights"];
  }

  // Phase G — labeled prediction phrases before collections→receipts expand.
  if (
    /\b(collection\s+delay(?:\s+estimate)?|payment\s+delay\s+(?:estimate|prediction)|collection\s+prediction|when\s+will\s+they\s+pay|collection_delay_estimate)\b/i.test(
      query
    )
  ) {
    return ["collection_delay_estimate"];
  }

  // Relationship composer (R1–R15) — high-confidence tools win
  const composed = composeNovaIntent(query);
  if (novaIntentIsDecisive(composed) && composed.tools.length > 0) {
    return composed.tools;
  }
  // Clarify-only: no tools (caller asks via novaAmbiguityClarification / compose clarify)
  if (novaIntentIsDecisive(composed) && composed.clarify && composed.tools.length === 0) {
    return [];
  }

  const { tools } = selectToolsFromLexicon(query);
  let selected = tools;
  // Another person's name → never my_work (session self); route to the named domain tool
  const personHintSelect = extractNovaPersonHint(query);
  if (personHintSelect) {
    selected = selected.filter((t) => t !== "my_work_summary" && t !== "daily_brief");
    const q = query.toLowerCase();
    const ensure = (tool: string) => {
      if (!selected.includes(tool)) {
        selected = [...selected.filter((t) => t !== "search_entities"), tool];
      }
    };
    if (/^(?:staff|employee)\s+/i.test(query.trim()) || /\b(staff|employees?)\b/i.test(q)) {
      ensure("staff_summary");
    }
    if (/\b(tasks?|todo|work)\b/i.test(q)) ensure("tasks_summary");
    if (/\bleave\b/i.test(q)) ensure("leave_summary");
    if (
      /\b(kpi\s+report\s+card|report\s*card\s+kpi|kpi\s+breakdown|kpi\s+scorecard)\b/i.test(q)
    ) {
      ensure("kpi_report");
    } else if (
      /\b(why\s+(?:is\s+)?(?:my\s+)?kpi|explain\s+kpi|kpi\s+kyun|kpi\s+analys|analyse\s+kpi|analyze\s+kpi|kpi\s+summary\s+(?:of|for)|summary\s+(?:of|for)\s+.+\bkpi)\b/i.test(
        q
      )
    ) {
      ensure("nova_analysis");
    } else if (/\bkpi\b/i.test(q)) {
      ensure("kpi_summary");
    }
    if (/\bincentives?\b/i.test(q)) ensure("incentives_summary");
    if (/\badvances?\b/i.test(q)) ensure("staff_advances_summary");
    if (/\b(salary|payroll)\b/i.test(q)) ensure("salary_summary");
    if (
      /\b(attendance|late|absent|present)\b/i.test(q) &&
      !/\b(late\s+payment|late\s+fee|late\s+charge|payment\s+late)\b/i.test(q) &&
      !/\b(sales|revenue|receipts?|collections?|invoices?|billing|receivables?|outstanding|payables?|payments?|fees?|charges?|deliver(?:y|ies)|dispatch(?:es)?|challans?)\b/i.test(
        q
      )
    ) {
      ensure("attendance_late_summary");
    }
    if (selected.length === 0 || selected.every((t) => t === "search_entities")) {
      selected = /^(?:staff|employee)\s+/i.test(query.trim())
        ? ["staff_summary"]
        : ["tasks_summary"];
    }
  }
  // Bare period alone should clarify metric — do not expand to money pack
  if (
    selected.length === 1 &&
    selected[0] === "search_entities" &&
    parseNovaDateRange(query) &&
    !isNovaBarePeriodOnlyAsk(query)
  ) {
    return ["sales_summary", "receipts_summary", "search_entities"];
  }
  // Single-token bare party (Acme / Avaada) → empty tools so metric clarify owns routing.
  // Multi-word company-ish names keep search_entities (Tata Steels).
  if (
    selected.length === 1 &&
    selected[0] === "search_entities" &&
    extractNovaBareEntityCandidate(query) &&
    !looksLikePartyOrProjectName(query.trim())
  ) {
    return [];
  }
  // KPI summary/report asks stay on kpi_* / nova_trend — never FY reports_snapshot / GSTR
  if (
    /\bkpi\b/i.test(query) &&
    !/\b(gstr|sales\s+register|ar\s+aging|receivable\s+aging|ap\s+aging)\b/i.test(query)
  ) {
    selected = selected.filter((t) => t !== "reports_snapshot" && t !== "gstr_snapshot");
  }
  return selected;
}

export function selectNovaToolsDetailed(query: string) {
  return selectToolsFromLexicon(query);
}

export async function runNovaTools(
  user: SessionUser,
  query: string,
  toolNames?: string[],
  opts?: {
    /** Pre-bound from ClarifyAct — never re-fuzzy the display name */
    boundEntity?: {
      id: string;
      type: "customer" | "vendor" | "project";
      code?: string | null;
      label?: string;
    } | null;
  }
): Promise<NovaToolPack> {
  let tz = DEFAULT_TIMEZONE;
  try {
    const { getAppTimezone } = await import("@/lib/datetime");
    tz = await getAppTimezone();
  } catch {
    tz = process.env.APP_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  }
  const range = parseNovaDateRange(query, new Date(), tz);
  const composedRun = composeNovaIntent(query);
  let selected =
    toolNames ??
    (novaIntentIsDecisive(composedRun) && composedRun.tools.length > 0
      ? composedRun.tools
      : novaIntentIsDecisive(composedRun) && composedRun.clarify
        ? []
        : selectToolsFromLexicon(query).tools);
  const detailed =
    novaIntentIsDecisive(composedRun) && composedRun.tools.length > 0
      ? {
          tools: composedRun.tools,
          topics: [],
          interpretedAs: composedRun.interpretedAs ?? [],
        }
      : selectToolsFromLexicon(query);
  if (
    !toolNames &&
    selected.length === 1 &&
    selected[0] === "search_entities" &&
    range &&
    !isNovaBarePeriodOnlyAsk(query)
  ) {
    selected = ["sales_summary", "receipts_summary", "search_entities"];
  }
  const requestedTools = [...selected];
  selected = filterNovaToolsForUser(user, selected);
  selected = applyNovaOpenToolFallbacks(user, query, requestedTools, selected);
  const searchSlots = runNovaSearchEngine(query);
  const staffPrefixedAsk = /^(?:staff|employee)\s+[A-Za-z]/i.test(query.trim());
  const whoIsStaffAsk =
    searchSlots.queryFamily === "people" &&
    searchSlots.entityType === "employee" &&
    searchSlots.tools.includes("staff_summary");
  let personHint = searchSlots.suppressPersonHint
    ? null
    : extractNovaPersonHint(query) ||
      (whoIsStaffAsk ? searchSlots.entityHint?.trim() || null : null);
  // Thin B: party-shaped person leaks → entity bind, never staff resolve
  let partyShapedPersonLeak: string | null = null;
  if (
    personHint &&
    looksLikePartyOrProjectName(personHint) &&
    !staffPrefixedAsk &&
    !whoIsStaffAsk
  ) {
    partyShapedPersonLeak = personHint;
    personHint = null;
  }
  // Named person / staff-profile asks never inherit sticky money party / bound customer
  // (individual KPI Analysis + leave/attendance must not rebind Tata-class entities).
  const personalDomainAsk =
    Boolean(personHint) &&
    (isNovaAnalysisCue(query) ||
      /\b(kpi|leave|attendance|tasks?|todos?|incentives?|advances?|expenses?|reimburs\w*|claims?|spend|spent|salary|payroll|late|absent|present|punch(?:ed)?)\b/i.test(
        query
      ));
  const rawEntityHint =
    staffPrefixedAsk || whoIsStaffAsk || personalDomainAsk
      ? null
      : opts?.boundEntity?.label ||
        opts?.boundEntity?.code ||
        searchSlots.entityHint?.trim() ||
        extractNovaEntityHint(query) ||
        partyShapedPersonLeak;
  const entityHint =
    rawEntityHint &&
    !isNovaNonReferentialName(rawEntityHint) &&
    !HOW_IS_FRAME.test(rawEntityHint)
      ? rawEntityHint
      : null;
  // Another person named → never run my_work_summary (would return session user's work)
  if (personHint) {
    selected = selected.filter((t) => t !== "my_work_summary" && t !== "daily_brief");
    const q = query.toLowerCase();
    const addIf = (tool: string, re: RegExp) => {
      if (re.test(q) && !selected.includes(tool)) {
        selected = filterNovaToolsForUser(user, [...selected, tool]);
      }
    };
    if (staffPrefixedAsk || whoIsStaffAsk || /\b(staff|employees?)\b/.test(q)) {
      if (!selected.includes("staff_summary")) {
        selected = filterNovaToolsForUser(user, [
          ...selected.filter((t) => t !== "search_entities"),
          "staff_summary",
        ]);
      }
    }
    addIf("tasks_summary", /\b(tasks?|todo|work)\b/);
    addIf("leave_summary", /\bleave\b/);
    addIf("overtime_summary", /\b(overtime|\bot\b)\b/);
    addIf("regularisation_summary", /\bregularis/);
    // Never bolt kpi_summary onto Analysis (report-card / digit dump guard).
    selected = filterNovaToolsForUser(user, refineNovaPersonKpiTools(selected, query));
    addIf("incentives_summary", /\bincentives?\b/);
    addIf("staff_advances_summary", /\badvances?\b/);
    addIf("staff_expense_summary", /\b(expenses?|reimburs\w*|claims?|spend|spent|kharcha)\b/);
    addIf("salary_summary", /\b(salary|payroll)\b/);
    // Match selectNovaTools: never route money/delivery “late” to attendance
    if (
      /\b(attendance|late|absent|present)\b/.test(q) &&
      !/\b(late\s+payment|late\s+fee|late\s+charge|payment\s+late)\b/.test(q) &&
      !/\b(sales|revenue|receipts?|collections?|invoices?|billing|receivables?|outstanding|payables?|payments?|fees?|charges?|deliver(?:y|ies)|dispatch(?:es)?|challans?)\b/.test(
        q
      ) &&
      !selected.includes("attendance_late_summary")
    ) {
      selected = filterNovaToolsForUser(user, [...selected, "attendance_late_summary"]);
    }
    if (
      (staffPrefixedAsk || whoIsStaffAsk) &&
      (selected.length === 0 || selected.every((t) => t === "search_entities"))
    ) {
      selected = filterNovaToolsForUser(user, ["staff_summary"]);
    }
  } else if ((staffPrefixedAsk || whoIsStaffAsk) && !toolNames) {
    selected = filterNovaToolsForUser(user, ["staff_summary"]);
  }
  // Label only what we actually run (avoid “tasks” when only receipts ran)
  const toolTopicLabels: Record<string, string> = {
    receipts_summary: "receipts",
    sales_summary: "billing / invoices",
    sales_orders_summary: "sales orders",
    purchase_orders_summary: "purchase orders",
    projects_summary: "projects",
    tasks_summary: "tasks",
    overdue_invoices: "receivables",
    collection_delay_estimate: "collection delay estimate",
    pending_workflow_counts: "pending workflow",
    attendance_late_summary: "attendance",
    leave_summary: "leave",
    overtime_summary: "overtime",
    regularisation_summary: "regularisation",
    kpi_summary: "KPI",
    kpi_report: "KPI report card",
    my_work_summary: "my work",
    daily_brief: "daily brief",
    proactive_insights: "proactive insights",
    nova_analysis: "analysis",
    nova_trend: "trend",
    accounts_snapshot: "accounts",
    staff_advances_summary: "staff advances",
    staff_expense_summary: "staff expenses / reimbursements",
    gstr_snapshot: "GSTR",
    gst_docs_summary: "GST docs",
    reports_snapshot: "reports",
    tally_status: "Tally",
    profitability_summary: "profitability",
    order_book_summary: "order book / FY target",
    director_dashboard_summary: "director / finance dashboard",
    bank_accounts_summary: "bank accounts",
    approvals_summary: "approvals",
    search_entities: "search",
    documents_open: "documents",
    documents_search: "document search",
    settings_open: "settings",
    appearance_open: "appearance",
    vendor_bank_open: "vendor bank details",
    notifications_open: "notifications",
    whatsapp_open: "WhatsApp",
    portal_open: "portal",
    automation_open: "automation",
    links_open: "links",
    bank_sms_open: "bank SMS",
    backup_open: "system backup",
    system_tools_open: "system tools",
    audit_log_open: "audit log",
  };
  let interpretedAs = [
    ...new Set(
      selected
        .map((t) => toolTopicLabels[t])
        .filter((x): x is string => Boolean(x))
    ),
  ];
  if (interpretedAs.length === 0) {
    interpretedAs = [...detailed.interpretedAs];
  }
  // Never mix all-time project contract values into a single-day answer
  if (isNovaSingleDayRange(range) && !/\bprojects?\b/.test(query.toLowerCase())) {
    selected = selected.filter((t) => t !== "projects_summary");
  }
  const facts: NovaToolFact[] = [];
  const links: NovaToolLink[] = [];
  const toolsUsed: string[] = [];
  const sampleLimit = isNovaSingleDayRange(range) ? 25 : 8;

  // Entity disambiguation (S1): several matches → clarify; exact → filter; not found → soft contains
  // When ClarifyAct already bound id+type, skip fuzzy resolve entirely.
  const structureAsk = parseEntityModuleAsk(query);
  const rankingAsk = isNovaTaskCompletionRankingAsk(query);
  // Optional soft path: when unset/false, person+task never waits on party clarify.
  // Set NOVA_QI_STRICT_PARTY_GATE=1 only to force party-first even on soft personal task asks.
  const strictPartyGate = process.env.NOVA_QI_STRICT_PARTY_GATE === "1";

  let entityFilterName: string | undefined = rankingAsk
    ? undefined
    : entityHint
      ? normalizeNovaEntityLookupHint(entityHint) || undefined
      : structureAsk?.entitySpan && !isNovaRankingWhEntityNoise(structureAsk.entitySpan)
        ? normalizeNovaEntityLookupHint(structureAsk.entitySpan) || undefined
        : undefined;

  if (rankingAsk) {
    recordQiCrumb({
      query: query.slice(0, 120),
      entitySpan: null,
      entityKindHint: null,
      resolveKind: "ranking_early",
      scoped: false,
      outcome: "no_entity",
      tools: selected,
    });
  }

  // Staff kindHint OR leading “Name pending|open|overdue tasks” → prefer person
  // before party resolve (tenant name collision). Bare “Name tasks” stays party-first.
  if (
    !rankingAsk &&
    !strictPartyGate &&
    !isNovaPlaceFramedTaskAsk(query) &&
    selected.includes("tasks_summary") &&
    (structureAsk?.entityKindHint === "staff" ||
      isNovaLeadingPersonFocusTaskAsk(query) ||
      (isNovaPersonalTaskAskShape(query) && Boolean(extractNovaPersonHint(query))))
  ) {
    const personFromStructure =
      extractNovaPersonHint(query) ||
      (structureAsk?.entityKindHint === "staff" ? structureAsk.entitySpan : null) ||
      null;
    if (personFromStructure && !looksLikePartyOrProjectName(personFromStructure)) {
      personHint = personFromStructure.trim();
      entityFilterName = undefined;
      toolsUsed.push("person_prefer");
    }
  }

  // Soft personal-task with extractable person + leading focus verbs → person first
  if (
    !rankingAsk &&
    !strictPartyGate &&
    !personHint &&
    !isNovaPlaceFramedTaskAsk(query) &&
    selected.includes("tasks_summary") &&
    isNovaPersonalTaskAskShape(query)
  ) {
    const extracted = extractNovaPersonHint(query);
    if (
      extracted &&
      !looksLikePartyOrProjectName(extracted) &&
      (isNovaLeadingPersonFocusTaskAsk(query) ||
        /\b(?:for|of|assigned\s+to)\s+/i.test(query) ||
        /\b(?:does|did|do)\s+.+\shave\b/i.test(query) ||
        /\b(?:ka|ki|ke)\s+/i.test(query))
    ) {
      personHint = extracted.trim();
      entityFilterName = undefined;
      toolsUsed.push("person_prefer");
    }
  }

  let resolvedEntityType: "customer" | "vendor" | "project" | null = null;
  let resolvedEntityDbId: string | null = null;
  if (opts?.boundEntity?.id && opts.boundEntity.type) {
    const bound = opts.boundEntity;
    const lookedUp = await lookupNovaEntityByBound(bound, user);
    if (lookedUp) {
      entityFilterName = lookedUp.name;
      resolvedEntityType = lookedUp.type;
      resolvedEntityDbId = lookedUp.id;
      toolsUsed.push("entity_resolve", "clarify_bound");
      // Bound party + accidental search_entities → open record skill (never thin search list).
      if (selected.length === 1 && selected[0] === "search_entities") {
        const openTool =
          lookedUp.type === "project"
            ? "project_command"
            : lookedUp.type === "vendor"
              ? "vendors_summary"
              : "customers_summary";
        selected = filterNovaToolsForUser(user, [openTool]);
      }
    } else {
      // Bound id no longer visible — soft deny rather than re-fuzzy the label
      toolsUsed.push("entity_resolve", "clarify");
      facts.push({
        tool: "entity_resolve",
        ok: true,
        data: {
          clarify: true,
          message: `I couldn’t reopen that ${bound.type} selection. Please ask again with the name or code.`,
          entityFilter: bound.label || bound.code || bound.id,
        },
      });
      return {
        facts,
        links,
        toolsUsed,
        interpretedAs: ["entity lookup"],
        range,
        entityHint,
        personHint,
      };
    }
  } else if (entityFilterName) {
    const searchPref = runNovaSearchEngine(query);
    const sensitiveMoney = isNovaSensitiveEntityResolveQuery(query, selected);
    // Kind hint from SE entityType, role words on the entity span, or “… project” near the party.
    const spanKind = parseNovaEntityRoleSpan(entityFilterName)?.entityKindHint ?? null;
    const queryKind: "project" | "customer" | "vendor" | null =
      searchPref.entityType === "project" ||
      searchPref.entityType === "customer" ||
      searchPref.entityType === "vendor"
        ? searchPref.entityType
        : /\bprojects?\b/i.test(query) && searchPref.entityHint
          ? "project"
          : null;
    const preferFromKind =
      preferTypesForKindHint(spanKind ?? queryKind ?? structureAsk?.entityKindHint ?? null) ??
      (searchPref.entityType === "project"
        ? (["project", "customer"] as const)
        : searchPref.entityType === "customer"
          ? (["customer", "project"] as const)
          : searchPref.entityType === "vendor"
            ? (["vendor", "project"] as const)
            : undefined);
    const resolvedEnt = await resolveNovaEntityHint(entityFilterName, user, {
      preferTypes: preferFromKind ? [...preferFromKind] : undefined,
      sensitiveMoney,
      // Scoped module asks: surface Staff chips when mixed with party hits.
      // Single-token task asks also load staff (tenant party-vs-person collision).
      includeStaff:
        Boolean(searchPref.suppressPersonHint && searchPref.entityHint) ||
        Boolean(partyShapedPersonLeak) ||
        (selected.includes("tasks_summary") &&
          Boolean(entityFilterName) &&
          !looksLikePartyOrProjectName(entityFilterName) &&
          /^[A-Za-z][A-Za-z0-9'.\-]{1,40}$/.test(entityFilterName.trim())),
    });
    if (resolvedEnt.kind === "ambiguous") {
      toolsUsed.push("entity_resolve", "clarify");
      facts.push({
        tool: "entity_resolve",
        ok: true,
        data: {
          clarify: true,
          message: resolvedEnt.message,
          entityFilter: entityFilterName,
          options: resolvedEnt.options,
        },
      });
      return {
        facts,
        links,
        toolsUsed,
        interpretedAs: ["entity lookup"],
        range,
        entityHint,
        personHint,
      };
    }
    if (resolvedEnt.kind === "ok") {
      entityFilterName = (resolvedEnt.entity.name ?? "").trim().replace(/\s+/g, " ");
      resolvedEntityType = resolvedEnt.entity.type;
      resolvedEntityDbId = resolvedEnt.entity.id;
      // Bare / SEARCH name that uniquely binds a project → Project Command (not thin search list)
      if (
        resolvedEnt.entity.type === "project" &&
        selected.length === 1 &&
        selected[0] === "search_entities" &&
        (searchPref.queryFamily === "resolve" ||
          searchPref.queryFamily === "search" ||
          searchPref.intent === "named_project_detail")
      ) {
        selected = filterNovaToolsForUser(user, ["project_command"]);
      }
    }
    if (resolvedEnt.kind === "not_found") {
      const moneySelected = selected.some((t) =>
        [
          "sales_summary",
          "receipts_summary",
          "overdue_invoices",
          "receivables_summary",
          "customer_outstanding",
          "staff_expense_summary",
          "sales_orders_summary",
          "credit_notes_summary",
          "payment_requests_summary",
          "purchase_orders_summary",
          "reports_snapshot",
          "gstr_snapshot",
          "director_dashboard_summary",
        ].includes(t)
      );
      const scopedPartyModule = selected.some((t) =>
        [
          "tasks_summary",
          "documents_search",
          "approvals_summary",
          "purchase_orders_summary",
          "sales_orders_summary",
          "delivery_summary",
          "grn_summary",
          "credit_notes_summary",
          "payment_requests_summary",
          "staff_expense_summary",
          "receivables_summary",
          "customer_outstanding",
          "project_command",
        ].includes(t)
      );
      // “aalok tasks” / “Arif pending tasks” / “tasks for arif”: soft single-token
      // party miss → demote to person path (never invent org-wide).
      // “tasks in avaada”: keep not-found clarify (explicit place/project framing).
      const personFallbackAsk =
        selected.includes("tasks_summary") &&
        Boolean(entityFilterName) &&
        looksLikeSingleTokenPartyLabel(entityFilterName) &&
        !looksLikePartyOrProjectName(entityFilterName) &&
        !isNovaPlaceFramedTaskAsk(query) &&
        (isNovaPersonTaskFallbackAsk(query, entityFilterName) ||
          /^(?:(?:show|list|get|check|find|fetch|display|give(?:\s+me)?)\s+)?[A-Za-z][A-Za-z0-9&.-]{1,40}\s+(?:(?:pending|open|overdue)\s+)?(?:tasks?|todos?)(?:\s+(?:pending|open|overdue))?\s*$/i.test(
            query.trim()
          ));
      if (personFallbackAsk && entityFilterName) {
        personHint = entityFilterName;
        entityFilterName = undefined;
        toolsUsed.push("entity_resolve", "person_fallback");
      } else if (moneySelected || scopedPartyModule) {
        toolsUsed.push("entity_resolve", "clarify");
        facts.push({
          tool: "entity_resolve",
          ok: true,
          data: {
            clarify: true,
            message: resolvedEnt.message,
            entityFilter: entityFilterName,
          },
        });
        return {
          facts,
          links,
          toolsUsed,
          interpretedAs: ["entity lookup"],
          range,
          entityHint,
          personHint,
        };
      }
    }
  }

  // P1: party/project entitySpan + scoped tools + no bind/person → clarify.
  // Staff kindHint / ranking noise / personHint never block.
  {
    const span = rankingAsk
      ? null
      : structureAsk?.entityKindHint === "staff"
        ? null
        : (structureAsk?.entitySpan ?? entityFilterName ?? null);
    const refuse = refuseSilentOrgWide({
      entitySpan: span,
      tools: selected,
      resolvedEntityId: resolvedEntityDbId,
      personHint,
      boundEntityId: opts?.boundEntity?.id ?? null,
      entityKindHint: structureAsk?.entityKindHint ?? null,
    });
    if (refuse) {
      const outcome = classifyQiAskOutcome({
        entitySpan: span,
        toolsImplyScope: toolsImplyPartyScope(selected),
        clarified: true,
        personHint,
        resolvedEntityId: resolvedEntityDbId,
      });
      recordQiCrumb({
        query: query.slice(0, 120),
        entitySpan: span,
        entityKindHint: structureAsk?.entityKindHint ?? null,
        resolveKind: "clarify_miss",
        scoped: true,
        outcome,
        tools: selected,
      });
      toolsUsed.push("entity_resolve", "scoped_gate");
      facts.push({
        tool: "entity_resolve",
        ok: true,
        data: {
          clarify: true,
          message: refuse.reason,
          entityFilter: structureAsk?.entitySpan ?? entityFilterName,
        },
      });
      return {
        facts,
        links,
        toolsUsed,
        interpretedAs: ["entity lookup"],
        range,
        entityHint: structureAsk?.entitySpan ?? entityHint,
        personHint,
      };
    }
  }

  // QI crumb — successful party bind on a scoped ask
  {
    const span = structureAsk?.entitySpan ?? entityFilterName ?? null;
    if (span && (resolvedEntityDbId || personHint)) {
      const outcome = classifyQiAskOutcome({
        entitySpan: span,
        toolsImplyScope: toolsImplyPartyScope(selected),
        resolvedEntityId: resolvedEntityDbId,
        personHint,
      });
      recordQiCrumb({
        query: query.slice(0, 120),
        entitySpan: span,
        entityKindHint: structureAsk?.entityKindHint ?? null,
        resolveKind: resolvedEntityDbId ? "bound" : "person_fallback",
        scoped: Boolean(resolvedEntityDbId),
        outcome,
        tools: selected,
      });
    }
  }

  // Person disambiguation: several matches → clarify before guessing money/HR tools
  if (personHint) {
    const resolvedPerson = await resolveNovaPersonHint(personHint, user);
    if (resolvedPerson.kind === "ambiguous") {
      toolsUsed.push("person_resolve", "clarify");
      facts.push({
        tool: "person_resolve",
        ok: true,
        data: {
          clarify: true,
          message: resolvedPerson.message,
          personHint,
          options: resolvedPerson.options,
        },
      });
      return {
        facts,
        links,
        toolsUsed,
        interpretedAs: ["person lookup"],
        range,
        entityHint,
        personHint,
      };
    }
  }

  for (const name of selected) {
    try {
    if (hasNovaSkill(name)) {
      toolsUsed.push(name);
      const skillResult = await dispatchNovaSkill(name, {
        user,
        query,
        tz,
        range,
        entityHint,
        entityFilterName,
        resolvedEntityType,
        resolvedEntityDbId,
        personHint,
        sampleLimit,
      });
      if (skillResult) {
        facts.push(skillResult.fact);
        if (skillResult.links?.length) links.push(...skillResult.links);
      }
      continue;
    }

    // Unknown tool — deny rather than silently skip (RBAC / lexicon drift safety)
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: `Unknown or unsupported NOVA tool: ${name}`,
    });
    toolsUsed.push(`${name}:unknown`);

    } catch (err) {
      // Never surface raw DB/stack details to the model or UI
      console.error(`[nova-tools] ${name}`, err);
      facts.push({
        tool: name,
        ok: false,
        error: "Lookup failed for this tool. Try again or open the related ERP screen.",
      });
      toolsUsed.push(`${name}:error`);
    }
  }

  // Dedupe links by href
  const seen = new Set<string>();
  const uniqueLinks = links.filter((l) => {
    if (seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });

  return {
    facts,
    links: uniqueLinks.slice(0, 6),
    toolsUsed,
    range,
    interpretedAs,
    entityHint,
    personHint,
  };
}

export function factsHaveUsableData(facts: NovaToolFact[]): boolean {
  return facts.some((f) => {
    if (!f.ok || f.denied) return false;
    if (f.tool === "search_entities") {
      return Number((f.data as { matchCount?: number })?.matchCount ?? 0) > 0;
    }
    if (f.tool === "sales_summary") {
      return Number((f.data as { invoiceCount?: number })?.invoiceCount ?? 0) >= 0 && f.data != null;
    }
    return f.data != null;
  });
}
