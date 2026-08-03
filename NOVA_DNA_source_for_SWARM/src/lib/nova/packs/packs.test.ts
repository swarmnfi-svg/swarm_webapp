/**
 * Pack + report plane unit tests (Sprints 2–3, 5–6).
 */
import { describe, expect, it } from "vitest";
import { selectNovaPackAttentions, buildNovaPackResult } from "@/lib/nova/pack-result";
import { buildNovaFinding } from "@/lib/nova/recipes/finding";
import { recipeMatchesQuery, getNovaRecipe } from "@/lib/nova/recipes/registry";
import {
  checksumNovaPack,
  recheckNovaReportPermissions,
  renderNovaReportCsv,
  renderNovaReportText,
} from "@/lib/nova/reports/report-service";
import { buildNovaReportSecurityEnvelope, defaultNovaReportExpiresAt } from "@/lib/nova/report-envelope";
import { MONTH_PERFORMANCE_PACK_VERSION } from "@/lib/nova/packs/month-performance";
import { PROJECT_COMMAND_PACK_VERSION } from "@/lib/nova/packs/project-command";
import { COLLECTION_ATTENTION_PACK_VERSION } from "@/lib/nova/packs/collection-attention";
import {
  PROJECT_COMMAND_FINDING_SHAPES,
  PROJECT_COMMAND_GOLDENS,
  PROJECT_COMMAND_METRIC_IDS,
  PROJECT_COMMAND_PACK_ID,
  PROJECT_COMMAND_QUESTIONS,
  buildProjectCommandPackStub,
} from "@/lib/nova/packs/project-command-prep";
import {
  COLLECTION_ATTENTION_GOLDENS,
  COLLECTION_ATTENTION_METRIC_IDS,
  COLLECTION_ATTENTION_PACK_ID,
  COLLECTION_ATTENTION_PRIMARY_MAX,
  COLLECTION_ATTENTION_QUESTIONS,
  buildCollectionAttentionDemoMaterialFindings,
  buildCollectionAttentionPackStub,
  selectCollectionAttentions,
} from "@/lib/nova/packs/collection-attention-prep";
import {
  ATTENDANCE_MONTH_GOLDENS,
  ATTENDANCE_MONTH_METRIC_IDS,
  ATTENDANCE_MONTH_PACK_ID,
  ATTENDANCE_MONTH_PRIMARY_MAX,
  ATTENDANCE_MONTH_QUESTIONS,
  ATTENDANCE_MONTH_RBAC,
  buildAttendanceMonthDemoMaterialFindings,
  buildAttendanceMonthPackStub,
  selectAttendanceMonthAttentions,
} from "@/lib/nova/packs/attendance-month-prep";
import {
  CASH_BANKING_GOLDENS,
  CASH_BANKING_METRIC_IDS,
  CASH_BANKING_PACK_ID,
  CASH_BANKING_PRIMARY_MAX,
  CASH_BANKING_QUESTIONS,
  CASH_BANKING_RBAC,
  CASH_BANKING_SHIP_OPTIONS,
  buildCashBankingDemoMaterialFindings,
  buildCashBankingPackStub,
  selectCashBankingAttentions,
} from "@/lib/nova/packs/cash-banking-prep";
import {
  PROJECT_COMMAND_TASKS_CHAPTER_SHAPES,
  TASKS_LIGHT_GOLDENS,
  TASKS_LIGHT_METRIC_IDS,
  TASKS_LIGHT_PACK_ID,
  TASKS_LIGHT_PRIMARY_MAX,
  TASKS_LIGHT_QUESTIONS,
  TASKS_LIGHT_RBAC,
  TASKS_LIGHT_SHIP_OPTIONS,
  buildTasksLightDemoMaterialFindings,
  buildTasksLightPackStub,
  selectTasksLightAttentions,
} from "@/lib/nova/packs/tasks-light-prep";
import {
  CUSTOMER_CHAPTER_FINDING_SHAPES,
  CUSTOMER_CHAPTER_GOLDENS,
  CUSTOMER_CHAPTER_METRIC_IDS,
  CUSTOMER_CHAPTER_PRIMARY_MAX,
  CUSTOMER_CHAPTER_QUESTIONS,
  CUSTOMER_CHAPTER_RBAC,
  CUSTOMER_CHAPTER_SHIP_OPTIONS,
  buildCustomerChapterDemoMaterialFindings,
  buildCustomerChapterNotesStub,
  selectCustomerChapterAttentions,
} from "@/lib/nova/packs/customer-chapter-prep";
import {
  NOVA_MONTH_ATTENTION_PRIMARY_MAX,
  NOVA_PACK_RESULT_SCHEMA_VERSION,
} from "@/lib/nova/invariants";

describe("pack routing", () => {
  it("matches Month / Project Command / Collection / Attendance / Cash asks", () => {
    expect(recipeMatchesQuery("How is this month going?")).toBe("month_performance");
    expect(recipeMatchesQuery("Month performance")).toBe("month_performance");
    expect(recipeMatchesQuery("how is this month attendance")).toBe("attendance_month");
    expect(recipeMatchesQuery("how is this month's attendance?")).toBe("attendance_month");
    expect(recipeMatchesQuery("attendance this month")).toBe("attendance_month");
    expect(recipeMatchesQuery("how is cash this week?")).toBe("cash_banking");
    expect(recipeMatchesQuery("bank balances")).toBe("cash_banking");
    expect(recipeMatchesQuery("tell me everything important about this project")).toBe(
      "project_command"
    );
    expect(recipeMatchesQuery("collection attention for Tata")).toBe("collection_attention");
    expect(getNovaRecipe("month_performance")?.readOnly).toBe(true);
    expect(getNovaRecipe("attendance_month")?.toolIds).toContain("attendance_late_summary");
    expect(getNovaRecipe("cash_banking")?.toolIds).toContain("bank_accounts_summary");
    expect(getNovaRecipe("project_command")?.toolIds.length).toBeGreaterThan(3);
  });
});

describe("attentions up-to-3", () => {
  it("caps primary and counts overflow", () => {
    const mk = (s: string) =>
      buildNovaFinding({
        observation: s,
        evidence: [{ toolId: "overdue_invoices", summary: s }],
        contributors: [{ toolId: "overdue_invoices", role: "x" }],
        confidence: "fact",
      });
    const a = selectNovaPackAttentions([mk("1"), mk("2"), mk("3"), mk("4")]);
    expect(a.primary).toHaveLength(NOVA_MONTH_ATTENTION_PRIMARY_MAX);
    expect(a.overflowCount).toBe(1);
    expect(selectNovaPackAttentions([]).primary).toHaveLength(0);
  });
});

describe("report plane", () => {
  it("checksum + render + permission re-check", () => {
    const pack = buildNovaPackResult({
      packId: "month_performance",
      packVersion: MONTH_PERFORMANCE_PACK_VERSION,
      period: {
        label: "Jul 2026",
        grain: "month",
        calendarKind: "calendar_month",
        source: "explicit",
      },
      dataAsOf: "2026-07-13T00:00:00.000Z",
      metrics: [{ metricId: "sales.period_total", version: "1", value: 100 }],
      facts: [],
      findings: [],
      attentions: { primary: [], overflowCount: 0 },
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["sales.period_total"],
          title: "KPI",
          points: [{ label: "Sales", value: 100, unit: "inr" }],
        },
      ],
      links: [],
      warnings: [{ code: "freshness", message: "live" }],
      omittedNotes: [],
      narrativeHints: ["Period: Jul 2026"],
    });
    const sum = checksumNovaPack(pack);
    expect(sum).toMatch(/^[a-f0-9]{64}$/);
    const envelope = buildNovaReportSecurityEnvelope({
      tenantId: "default",
      ownerUserId: "u1",
      packId: "month_performance",
      packVersion: MONTH_PERFORMANCE_PACK_VERSION,
      packSchemaVersion: 1,
      metricVersions: { "sales.period_total": "1" },
      sensitivity: "standard",
      permissionsUsed: ["ai.assistant.read", "invoice.read"],
      dataAsOf: pack.dataAsOf,
      expiresAt: defaultNovaReportExpiresAt(),
      checksum: sum,
      objectKeys: ["nova/reports/default/u1/r1/snapshot.json"],
    });
    const text = renderNovaReportText({
      title: "Month",
      narrative: "ok",
      pack,
      envelope,
    });
    expect(text).toMatch(/immutable/i);
    expect(renderNovaReportCsv(pack)).toMatch(/sales\.period_total/);

    const staff = {
      id: "u1",
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read"],
    } as never;
    const denied = recheckNovaReportPermissions(staff, ["ai.assistant.read", "invoice.read"]);
    expect(denied.ok).toBe(false);

    const okUser = {
      id: "u1",
      role: "DIRECTOR",
      grantedPermissions: ["ai.assistant.read", "invoice.read"],
    } as never;
    expect(recheckNovaReportPermissions(okUser, ["ai.assistant.read", "invoice.read"]).ok).toBe(
      true
    );
  });

  it("pack versions are set", () => {
    expect(MONTH_PERFORMANCE_PACK_VERSION).toBe("1.0.0");
    expect(PROJECT_COMMAND_PACK_VERSION).toBe("1.0.0");
    expect(COLLECTION_ATTENTION_PACK_VERSION).toBe("1.0.0");
  });
});

describe("Sprint 5 Project Command PREP", () => {
  it("stub returns NovaPackResult-compatible EPC spine", () => {
    const pack = buildProjectCommandPackStub({ projectLabel: "Tata plant" });
    expect(pack.schemaVersion).toBe(NOVA_PACK_RESULT_SCHEMA_VERSION);
    expect(pack.packId).toBe(PROJECT_COMMAND_PACK_ID);
    expect(pack.metrics.map((m) => m.metricId)).toEqual([...PROJECT_COMMAND_METRIC_IDS]);
    expect(pack.metrics.every((m) => m.value === null && m.certification === "draft")).toBe(true);
    expect(pack.findings).toHaveLength(0);
    expect(pack.attentions.primary).toHaveLength(0);
    expect(pack.facts).toHaveLength(0);
    expect(pack.narrativeHints.some((h) => /Sprint 3 report plane/i.test(h))).toBe(true);
    expect(PROJECT_COMMAND_QUESTIONS[0]).toMatch(/everything important about this project/i);
    expect(PROJECT_COMMAND_FINDING_SHAPES.some((s) => s.id === "milestones_gap" && s.deferred)).toBe(
      true
    );
    expect(PROJECT_COMMAND_GOLDENS.some((g) => g.id === "pc-signature")).toBe(true);
  });
});

describe("Sprint 5–6 pack golden routing (CI)", () => {
  it("Project Command goldens route when expectRecipeId is a pack/recipe", () => {
    for (const g of PROJECT_COMMAND_GOLDENS) {
      if (g.expectRecipeId === "clarify") continue; // dialog-layer (unresolved entity)
      if (g.id === "pc-follow-up-after-month") continue; // DialogState project slot
      expect(recipeMatchesQuery(g.query), g.id).toBe(g.expectRecipeId);
    }
  });

  it("Collection Attention goldens route when expectRecipeId is a pack", () => {
    for (const g of COLLECTION_ATTENTION_GOLDENS) {
      if (g.expectRecipeId === "clarify") {
        // Bare "collection attention" still matches pack phrase; clarify is dialog when no party.
        expect(recipeMatchesQuery(g.query), g.id).toBe("collection_attention");
        continue;
      }
      expect(recipeMatchesQuery(g.query), g.id).toBe(g.expectRecipeId);
    }
  });

  it("Attendance Month goldens route (pack vs skill vs Month)", () => {
    for (const g of ATTENDANCE_MONTH_GOLDENS) {
      if (g.expectRecipeId === "clarify") {
        expect(recipeMatchesQuery(g.query), g.id).toBeNull();
        continue;
      }
      if (g.expectRecipeId === "skill:attendance_late_summary") {
        expect(recipeMatchesQuery(g.query), g.id).toBeNull();
        continue;
      }
      expect(recipeMatchesQuery(g.query), g.id).toBe(g.expectRecipeId);
    }
  });

  it("Cash / Banking goldens route (pack vs thin skill vs Month)", () => {
    for (const g of CASH_BANKING_GOLDENS) {
      if (typeof g.expectRecipeId === "string" && g.expectRecipeId.startsWith("skill:")) {
        expect(recipeMatchesQuery(g.query), g.id).toBeNull();
        continue;
      }
      expect(recipeMatchesQuery(g.query), g.id).toBe(g.expectRecipeId);
    }
  });
});

describe("Sprint 6 Collection Attention PREP", () => {
  it("stub returns NovaPackResult-compatible collection spine", () => {
    const pack = buildCollectionAttentionPackStub({ scopeLabel: "Avaada" });
    expect(pack.schemaVersion).toBe(NOVA_PACK_RESULT_SCHEMA_VERSION);
    expect(pack.packId).toBe(COLLECTION_ATTENTION_PACK_ID);
    expect(pack.metrics.map((m) => m.metricId)).toEqual([...COLLECTION_ATTENTION_METRIC_IDS]);
    expect(pack.metrics.every((m) => m.value === null && m.certification === "draft")).toBe(true);
    expect(pack.findings).toHaveLength(0);
    expect(pack.attentions.primary).toHaveLength(0);
    expect(pack.facts).toHaveLength(0);
    expect(COLLECTION_ATTENTION_METRIC_IDS).toEqual(
      expect.arrayContaining([
        "ar.receivables_open",
        "ar.ageing_buckets",
        "ar.concentration_top",
        "receipts.period_trend",
        "ar.unallocated_advances",
        "ar.collection_priorities",
      ])
    );
    expect(COLLECTION_ATTENTION_QUESTIONS[0]).toMatch(/collection attention for Avaada/i);
    expect(COLLECTION_ATTENTION_GOLDENS.some((g) => g.id === "ca-signature")).toBe(true);
    expect(pack.narrativeHints.some((h) => /Sprint 3 report plane \+ Sprint 4/i.test(h))).toBe(
      true
    );
  });

  it("caps primary attentions and counts overflow", () => {
    const material = buildCollectionAttentionDemoMaterialFindings(5);
    const attentions = selectCollectionAttentions(material);
    expect(COLLECTION_ATTENTION_PRIMARY_MAX).toBe(NOVA_MONTH_ATTENTION_PRIMARY_MAX);
    expect(attentions.primary).toHaveLength(COLLECTION_ATTENTION_PRIMARY_MAX);
    expect(attentions.overflowCount).toBe(2);

    const pack = buildCollectionAttentionPackStub({
      scopeLabel: "Tata",
      materialFindings: material,
    });
    expect(pack.attentions.primary).toHaveLength(3);
    expect(pack.attentions.overflowCount).toBe(2);
    expect(selectCollectionAttentions([]).primary).toHaveLength(0);
  });
});

describe("Attendance Month PREP", () => {
  it("stub returns NovaPackResult-compatible attendance spine", () => {
    const pack = buildAttendanceMonthPackStub({ periodLabel: "Jul 2026" });
    expect(pack.schemaVersion).toBe(NOVA_PACK_RESULT_SCHEMA_VERSION);
    expect(pack.packId).toBe(ATTENDANCE_MONTH_PACK_ID);
    expect(pack.metrics.map((m) => m.metricId)).toEqual([...ATTENDANCE_MONTH_METRIC_IDS]);
    expect(pack.metrics.every((m) => m.value === null && m.certification === "draft")).toBe(true);
    expect(pack.findings).toHaveLength(0);
    expect(pack.attentions.primary).toHaveLength(0);
    expect(ATTENDANCE_MONTH_QUESTIONS[0]).toMatch(/how is this month's attendance/i);
    expect(ATTENDANCE_MONTH_GOLDENS.some((g) => g.id === "am-signature")).toBe(true);
    expect(ATTENDANCE_MONTH_RBAC.permissionsAnyOf).toEqual(
      expect.arrayContaining(["hr.attendance.read", "hr.punch.self"])
    );
    expect(pack.narrativeHints.some((h) => /Savable via Save report/i.test(h))).toBe(true);
  });

  it("caps primary attentions and counts overflow", () => {
    const material = buildAttendanceMonthDemoMaterialFindings(4);
    const attentions = selectAttendanceMonthAttentions(material);
    expect(ATTENDANCE_MONTH_PRIMARY_MAX).toBe(NOVA_MONTH_ATTENTION_PRIMARY_MAX);
    expect(attentions.primary).toHaveLength(3);
    expect(attentions.overflowCount).toBe(1);
    expect(selectAttendanceMonthAttentions([]).primary).toHaveLength(0);
  });
});

describe("Cash / Banking PREP", () => {
  it("stub returns NovaPackResult-compatible cash spine + RBAC notes", () => {
    const pack = buildCashBankingPackStub({
      periodLabel: "this week",
      shipAs: "named_pack",
    });
    expect(pack.schemaVersion).toBe(NOVA_PACK_RESULT_SCHEMA_VERSION);
    expect(pack.packId).toBe(CASH_BANKING_PACK_ID);
    expect(pack.metrics.map((m) => m.metricId)).toEqual([...CASH_BANKING_METRIC_IDS]);
    expect(pack.metrics.every((m) => m.value === null && m.certification === "draft")).toBe(true);
    expect(CASH_BANKING_METRIC_IDS).toEqual(
      expect.arrayContaining([
        "bank.book_balance",
        "bank.operational_balance",
        "receipts.period_collected",
        "bank_recon.summary",
        "pr.awaiting_action",
      ])
    );
    expect(CASH_BANKING_QUESTIONS[0]).toMatch(/how is cash this week/i);
    expect(CASH_BANKING_GOLDENS.some((g) => g.id === "cb-signature")).toBe(true);
    expect(CASH_BANKING_SHIP_OPTIONS).toEqual(["named_pack", "month_chapter"]);
    expect(CASH_BANKING_RBAC.permissionsAnyOf).toEqual(["bank.read"]);
    expect(CASH_BANKING_RBAC.notes.some((n) => /balancesVisible/i.test(n))).toBe(true);
    expect(pack.narrativeHints.some((h) => /named_pack/i.test(h))).toBe(true);
    expect(pack.narrativeHints.some((h) => /Savable via Save report/i.test(h))).toBe(true);
  });

  it("caps primary attentions and counts overflow", () => {
    const material = buildCashBankingDemoMaterialFindings(5);
    const attentions = selectCashBankingAttentions(material);
    expect(CASH_BANKING_PRIMARY_MAX).toBe(NOVA_MONTH_ATTENTION_PRIMARY_MAX);
    expect(attentions.primary).toHaveLength(3);
    expect(attentions.overflowCount).toBe(2);
  });
});

describe("Tasks light / Project Command Tasks chapter PREP", () => {
  it("stub returns NovaPackResult-compatible tasks spine + RBAC notes", () => {
    const pack = buildTasksLightPackStub({
      scopeLabel: "Tata plant",
      shipAs: "project_chapter",
    });
    expect(pack.schemaVersion).toBe(NOVA_PACK_RESULT_SCHEMA_VERSION);
    expect(pack.packId).toBe(TASKS_LIGHT_PACK_ID);
    expect(pack.metrics.map((m) => m.metricId)).toEqual([...TASKS_LIGHT_METRIC_IDS]);
    expect(pack.metrics.every((m) => m.value === null && m.certification === "draft")).toBe(true);
    expect(TASKS_LIGHT_METRIC_IDS).toEqual(
      expect.arrayContaining(["tasks.open", "tasks.overdue", "tasks.due_soon", "my_work.summary"])
    );
    expect(TASKS_LIGHT_QUESTIONS[0]).toMatch(/my overdue tasks/i);
    expect(TASKS_LIGHT_GOLDENS.some((g) => g.id === "tl-signature-overdue")).toBe(true);
    expect(TASKS_LIGHT_SHIP_OPTIONS).toEqual(["project_chapter", "named_pack"]);
    expect(TASKS_LIGHT_RBAC.permissionsAnyOf).toEqual(
      expect.arrayContaining(["task.read.self", "task.edit.team", "task.admin"])
    );
    expect(PROJECT_COMMAND_TASKS_CHAPTER_SHAPES.every((s) => !s.lightPackOnly)).toBe(true);
    expect(pack.narrativeHints.some((h) => /project_chapter/i.test(h))).toBe(true);
    expect(pack.narrativeHints.some((h) => /presentation polish/i.test(h))).toBe(true);
  });

  it("caps primary attentions and counts overflow", () => {
    const material = buildTasksLightDemoMaterialFindings(4);
    const attentions = selectTasksLightAttentions(material);
    expect(TASKS_LIGHT_PRIMARY_MAX).toBe(NOVA_MONTH_ATTENTION_PRIMARY_MAX);
    expect(attentions.primary).toHaveLength(3);
    expect(attentions.overflowCount).toBe(1);
    expect(selectTasksLightAttentions([]).primary).toHaveLength(0);
  });

  it("goldens document project-scoped → Project Command; light pack not live yet", () => {
    for (const g of TASKS_LIGHT_GOLDENS) {
      if (g.id === "tl-project-command-spine") {
        expect(recipeMatchesQuery(g.query), g.id).toBe("project_command");
        continue;
      }
      if (g.expectRecipeId === "project_command") {
        expect(recipeMatchesQuery(g.query), g.id).toBe("project_command");
        continue;
      }
      if (g.expectRecipeId === "clarify") continue;
      if (
        g.expectRecipeId === "tasks_light" ||
        (typeof g.expectRecipeId === "string" && g.expectRecipeId.startsWith("skill:"))
      ) {
        expect(recipeMatchesQuery(g.query), g.id).not.toBe("month_performance");
        continue;
      }
    }
  });
});

describe("Customer chapter (Collection Attention) PREP", () => {
  it("stub returns Collection pack id with customer chapter notes", () => {
    const pack = buildCustomerChapterNotesStub({ scopeLabel: "Avaada" });
    expect(pack.schemaVersion).toBe(NOVA_PACK_RESULT_SCHEMA_VERSION);
    expect(pack.packId).toBe(COLLECTION_ATTENTION_PACK_ID);
    expect(pack.metrics.map((m) => m.metricId)).toEqual([...CUSTOMER_CHAPTER_METRIC_IDS]);
    expect(pack.metrics.every((m) => m.value === null && m.certification === "draft")).toBe(true);
    expect(CUSTOMER_CHAPTER_METRIC_IDS).toEqual(
      expect.arrayContaining([
        "customers.active_count",
        "customers.total_count",
        "ar.customer_outstanding",
      ])
    );
    expect(CUSTOMER_CHAPTER_QUESTIONS.some((q) => /collection attention for Avaada/i.test(q))).toBe(
      true
    );
    expect(CUSTOMER_CHAPTER_GOLDENS.some((g) => g.id === "cc-collection-signature")).toBe(true);
    expect(CUSTOMER_CHAPTER_SHIP_OPTIONS).toEqual(["collection_chapter"]);
    expect(CUSTOMER_CHAPTER_RBAC.permissionsAnyOf).toEqual(["customer.read"]);
    expect(CUSTOMER_CHAPTER_FINDING_SHAPES.some((s) => s.id === "customer_master")).toBe(true);
    expect(pack.narrativeHints.some((h) => /collection_chapter only/i.test(h))).toBe(true);
    expect(pack.narrativeHints.some((h) => /presentation polish/i.test(h))).toBe(true);
  });

  it("caps primary attentions and counts overflow", () => {
    const material = buildCustomerChapterDemoMaterialFindings(5);
    const attentions = selectCustomerChapterAttentions(material);
    expect(CUSTOMER_CHAPTER_PRIMARY_MAX).toBe(NOVA_MONTH_ATTENTION_PRIMARY_MAX);
    expect(attentions.primary).toHaveLength(3);
    expect(attentions.overflowCount).toBe(2);
  });

  it("goldens keep Collection as pack #3; thin customers stays skill", () => {
    for (const g of CUSTOMER_CHAPTER_GOLDENS) {
      if (g.id === "cc-collection-signature" || g.id === "cc-inside-month" || g.id === "cc-no-risk-score") {
        expect(recipeMatchesQuery(g.query), g.id).toBe(g.expectRecipeId);
        continue;
      }
      if (g.expectRecipeId === "collection_attention") {
        expect(recipeMatchesQuery(g.query), g.id).toBe("collection_attention");
        continue;
      }
      if (g.expectRecipeId === "month_performance") {
        expect(recipeMatchesQuery(g.query), g.id).toBe("month_performance");
        continue;
      }
      if (g.expectRecipeId === "clarify") continue;
      if (typeof g.expectRecipeId === "string" && g.expectRecipeId.startsWith("skill:")) {
        expect(recipeMatchesQuery(g.query), g.id).toBeNull();
        continue;
      }
    }
  });
});
