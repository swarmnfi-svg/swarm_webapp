import { describe, expect, it } from "vitest";
import {
  parseNovaEntityRoleSpan,
  parseEntityModuleAsk,
  preferTypesForKindHint,
  acceptsPartyEntitySpan,
  isNovaTemporalOrModuleEntityNoise,
  pickNovaQueryDepth,
  refuseSilentOrgWide,
  stickyModuleFollowUpNeedsBind,
  isNovaModuleOnlyFollowUp,
  shouldClarifyMixedEntityTypes,
  isNovaPersonTaskFallbackAsk,
  isNovaPlaceFramedTaskAsk,
  isNovaPersonalTaskAskShape,
} from "@/lib/nova/query-structure";
import { inferNovaAnalysisDomain } from "@/lib/nova/analysis/domain";
import { inferNovaTrendDomain } from "@/lib/nova/trend/domain";
import { runNovaSearchEngine } from "@/lib/nova/nova-search-engine";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { extractNovaEntityHint, extractNovaPersonHint } from "@/lib/ai/nova-lexicon";
import { stickyModuleFollowUpClarifyReason } from "@/lib/nova/dialog-state";

describe("query-structure P1 parsers", () => {
  it("avaada project → span Avaada, kind project", () => {
    const p = parseNovaEntityRoleSpan("avaada project");
    expect(p?.entitySpan.toLowerCase()).toBe("avaada");
    expect(p?.entityKindHint).toBe("project");
    expect(preferTypesForKindHint(p!.entityKindHint)).toEqual(["project", "customer"]);
  });

  it("month / relative-day / module noun phrases are never a party span (bug sweep)", () => {
    // Temporal tokens must not bind as an entity (“july sales”, “today receipts”).
    for (const t of ["july", "August", "today", "yesterday", "this", "month", "fy", "q1", "monday"]) {
      expect(isNovaTemporalOrModuleEntityNoise(t), t).toBe(true);
      expect(acceptsPartyEntitySpan(t, true), t).toBe(false);
    }
    // Bare module / metric noun phrases must not bind as an entity.
    for (const t of ["payment requests", "invoices", "receipts", "approvals", "sales", "deliveries"]) {
      expect(isNovaTemporalOrModuleEntityNoise(t), t).toBe(true);
      expect(acceptsPartyEntitySpan(t, true), t).toBe(false);
    }
    // Quantifiers from count phrasing (“how many payment requests”) must not bind.
    for (const t of ["many", "much", "several", "few", "multiple"]) {
      expect(isNovaTemporalOrModuleEntityNoise(t), t).toBe(true);
      expect(acceptsPartyEntitySpan(t, true), t).toBe(false);
    }
    expect(runNovaSearchEngine("how many payment requests").entityHint).toBeNull();
    expect(runNovaSearchEngine("how much sales").entityHint).toBeNull();
    // Real party/project names still bind.
    for (const t of ["Avaada", "James School", "Tata Steel"]) {
      expect(isNovaTemporalOrModuleEntityNoise(t), t).toBe(false);
      expect(acceptsPartyEntitySpan(t, true), t).toBe(true);
    }
    // “payment requests pending” must not be scoped to a fake “payment requests” party.
    expect(parseEntityModuleAsk("payment requests pending")).toBeNull();
  });

  it("FY / quarter / year-range period tokens are never a party span (bug sweep #2)", () => {
    // Year-bearing FY / quarter tokens must not bind as an entity (previously
    // "fy 25-26 receipts" scoped to a fake "fy 25-26" party and dropped the period).
    for (const t of [
      "fy 25-26",
      "fy 2025-26",
      "f.y 25-26",
      "q1 2026",
      "q3 26",
      "h1 26",
      "25-26",
      "2025-26",
      "2025/26",
      "cy 2026",
    ]) {
      expect(isNovaTemporalOrModuleEntityNoise(t), t).toBe(true);
      expect(acceptsPartyEntitySpan(t, true), t).toBe(false);
    }
    // "outstanding" is a metric word, never a party.
    expect(isNovaTemporalOrModuleEntityNoise("outstanding")).toBe(true);
    // Real party/project names with digits still bind (project codes, alphanumerics).
    for (const t of ["C0001-P001", "Plant 2", "Site 4B"]) {
      expect(isNovaTemporalOrModuleEntityNoise(t), t).toBe(false);
    }
  });

  it("james school project task → James School + project + tasks", () => {
    const p = parseNovaEntityRoleSpan("james school project task");
    expect(p?.entitySpan.toLowerCase()).toBe("james school");
    expect(p?.entityKindHint).toBe("project");
    expect(p?.moduleHint).toBe("tasks");
  });

  it("Avaada project task → Avaada + project + tasks", () => {
    const p = parseNovaEntityRoleSpan("Avaada project task");
    expect(p?.entitySpan).toBe("Avaada");
    expect(p?.entityKindHint).toBe("project");
    expect(p?.moduleHint).toBe("tasks");
  });

  it("tasks in avaada via parseEntityModuleAsk", () => {
    const p = parseEntityModuleAsk("tasks in avaada");
    expect(p?.entitySpan.toLowerCase()).toBe("avaada");
    expect(p?.moduleHint).toBe("tasks");
    expect(p?.entityKindHint).toBe("project");
  });

  it("Hinglish: avaada ka task", () => {
    const p = parseEntityModuleAsk("avaada ka task");
    expect(p?.entitySpan.toLowerCase()).toBe("avaada");
    expect(p?.moduleHint).toBe("tasks");
  });

  it("accepts single-token brands when allowed", () => {
    expect(acceptsPartyEntitySpan("avaada", true)).toBe(true);
    expect(acceptsPartyEntitySpan("avaada", false)).toBe(false);
    expect(acceptsPartyEntitySpan("tata steel", false)).toBe(true);
  });
});

describe("query-structure P1 gates / depth / conflict", () => {
  it("refuseSilentOrgWide when entitySpan + scoped tools + no bind", () => {
    const r = refuseSilentOrgWide({
      entitySpan: "avaada",
      tools: ["tasks_summary"],
    });
    expect(r?.clarify).toBe(true);
    expect(
      refuseSilentOrgWide({
        entitySpan: "avaada",
        tools: ["tasks_summary"],
        resolvedEntityId: "p1",
      })
    ).toBeNull();
    expect(
      refuseSilentOrgWide({
        entitySpan: "aalok",
        tools: ["tasks_summary"],
        personHint: "aalok",
      })
    ).toBeNull();
  });

  it("sticky module follow-up needs bind when prior entityHint", () => {
    expect(isNovaModuleOnlyFollowUp("pending tasks")).toBe(true);
    expect(isNovaModuleOnlyFollowUp("tasks in avaada")).toBe(false);
    expect(
      stickyModuleFollowUpNeedsBind({
        isModuleOnly: true,
        boundEntityId: null,
        slotsEntityHint: "Avaada",
      })
    ).toBe(true);
    expect(
      stickyModuleFollowUpNeedsBind({
        isModuleOnly: true,
        boundEntityId: "p1",
        slotsEntityHint: "Avaada",
      })
    ).toBe(false);
    expect(
      stickyModuleFollowUpClarifyReason("pending tasks", {
        pendingClarify: null,
        slots: {
          family: "tasks",
          entityHint: "Avaada",
          turnCount: 1,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      })
    ).toMatch(/which project or customer/i);
    expect(
      stickyModuleFollowUpClarifyReason("pending tasks", {
        pendingClarify: null,
        slots: {
          family: "tasks",
          entityHint: null,
          personHint: "Arif",
          turnCount: 1,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          updatedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      })
    ).toBeNull();
  });

  it("depth picker: thin vs analysis vs trend vs pack", () => {
    expect(pickNovaQueryDepth("avaada tasks")).toBe("thin");
    expect(pickNovaQueryDepth("why are avaada tasks overdue")).toBe("analysis");
    expect(pickNovaQueryDepth("late task completion trend for avaada")).toBe("trend");
    expect(pickNovaQueryDepth("everything about james school project")).toBe("pack");
    // Money/ops late must not become Analysis depth (routing steals into nova_analysis)
    expect(pickNovaQueryDepth("why late payment")).toBe("thin");
    expect(pickNovaQueryDepth("why late invoices")).toBe("thin");
    expect(pickNovaQueryDepth("why late delivery")).toBe("thin");
  });

  it("conflict policy: mixed types always clarify", () => {
    expect(shouldClarifyMixedEntityTypes(["customer", "project"])).toBe(true);
    expect(shouldClarifyMixedEntityTypes(["customer"], { staffCandidateCount: 1 })).toBe(
      true
    );
    expect(shouldClarifyMixedEntityTypes(["project"])).toBe(false);
  });

  it("shared noise: lexicon extract + party span reject temporal/module/quantifier", () => {
    for (const t of ["july", "payment requests", "many", "fy 25-26", "outstanding"] as const) {
      expect(isNovaTemporalOrModuleEntityNoise(t), t).toBe(true);
      expect(acceptsPartyEntitySpan(t, true), t).toBe(false);
    }
    expect(extractNovaEntityHint("july sales")).toBeNull();
    expect(extractNovaEntityHint("payment requests pending")).toBeNull();
    expect(extractNovaEntityHint("Avaada sales")).toBe("Avaada");
  });
});

describe("QI goldens P1 — Avaada / James School / Analysis", () => {
  it("QI-01..05 + hinglish: scoped tasks or PC, never empty entity", () => {
    for (const q of [
      "tasks in avaada",
      "Avaada project task",
      "avaada tasks",
      "james school project task",
      "avaada ka task",
    ] as const) {
      const slots = runNovaSearchEngine(q);
      expect(slots.entityHint, q).toBeTruthy();
      expect(slots.entityHint, q).not.toMatch(/\b(project|tasks?|kaam)\b/i);
      expect(slots.tools[0], q).toMatch(/^(tasks_summary|project_command)$/);
      const tools = selectNovaTools(q);
      expect(tools[0], q).toMatch(/^(tasks_summary|project_command)$/);
    }
  });

  it("QI-09: why are avaada tasks overdue → analysis + tasks domain", () => {
    const q = "why are avaada tasks overdue";
    expect(selectNovaTools(q)).toEqual(["nova_analysis"]);
    expect(inferNovaAnalysisDomain(q).domain).toBe("tasks");
  });

  it("QI-10: late task completion trend for avaada → trend + span", () => {
    const q = "late task completion trend for avaada";
    expect(selectNovaTools(q)).toEqual(["nova_trend"]);
    const d = inferNovaTrendDomain(q);
    expect(d.domain).toBe("task_late_completion");
    expect(d.entitySpan?.toLowerCase()).toBe("avaada");
  });

  it("employee expense trend → trend + staff expense domain", () => {
    const q = "employee expense trend";
    expect(selectNovaTools(q)).toEqual(["nova_trend"]);
    expect(inferNovaTrendDomain(q).domain).toBe("staff_expense_spend");
  });
});

describe("QI recovery — person task + ranking (3.1.7)", () => {
  it("who completed most task(s) → ranking, not party entity", () => {
    for (const q of [
      "who completed most task",
      "who completed most tasks",
      "who completed the most tasks",
      "who completed more tasks",
    ] as const) {
      expect(parseEntityModuleAsk(q), q).toBeNull();
      const slots = runNovaSearchEngine(q);
      expect(slots.intent, q).toBe("task_completion_ranking");
      expect(slots.entityHint, q).toBeNull();
      expect(slots.tools, q).toEqual(["tasks_summary"]);
      expect(selectNovaTools(q), q).toContain("tasks_summary");
      expect(
        refuseSilentOrgWide({
          entitySpan: null,
          tools: slots.tools,
          entityKindHint: null,
        }),
        q
      ).toBeNull();
    }
  });

  it("which tasks for arif is over due → staff person, not project demand", () => {
    for (const q of [
      "which tasks for arif is over due",
      "which tasks for arif is overdue",
      "tasks for arif",
    ] as const) {
      const pe = parseEntityModuleAsk(q);
      expect(pe?.entitySpan.toLowerCase(), q).toBe("arif");
      expect(pe?.entityKindHint, q).toBe("staff");
      expect(extractNovaPersonHint(q)?.toLowerCase(), q).toBe("arif");
      expect(selectNovaTools(q), q).toContain("tasks_summary");
      expect(
        refuseSilentOrgWide({
          entitySpan: pe?.entitySpan,
          tools: ["tasks_summary"],
          personHint: extractNovaPersonHint(q),
          entityKindHint: pe?.entityKindHint,
        }),
        q
      ).toBeNull();
    }
  });

  it("Arif pending/open tasks → person extract; Avaada place still scoped", () => {
    for (const q of [
      "Arif pending tasks",
      "arif open tasks",
      "aalok tasks",
      "show me Arif overdue tasks",
      "does Arif have overdue tasks",
      "Arif ka pending tasks",
      "Arif ka pending",
      "pending for Arif",
      "open for Arif",
    ] as const) {
      expect(extractNovaPersonHint(q), q).toBeTruthy();
      expect(isNovaPersonTaskFallbackAsk(q) || isNovaPersonalTaskAskShape(q), q).toBe(true);
      expect(selectNovaTools(q), q).toContain("tasks_summary");
    }
    expect(isNovaPersonalTaskAskShape("Arif ka pending")).toBe(true);
    expect(selectNovaTools("Arif ka pending")).not.toContain("search_entities");
    for (const q of ["pending for Arif", "open for Arif"] as const) {
      expect(isNovaPersonalTaskAskShape(q), q).toBe(true);
      const pe = parseEntityModuleAsk(q);
      expect(pe?.entitySpan.toLowerCase(), q).toBe("arif");
      expect(pe?.entityKindHint, q).toBe("staff");
      expect(pe?.moduleHint, q).toBe("tasks");
    }
    // Overdue bare-for stays finance; approvals pending stays approvals path
    expect(isNovaPersonalTaskAskShape("overdue for Arif")).toBe(false);
    expect(selectNovaTools("overdue for Arif")).toContain("overdue_invoices");
    expect(isNovaPersonalTaskAskShape("approvals pending for Avaada")).toBe(false);
    for (const q of ["tasks in avaada", "avaada tasks"] as const) {
      const slots = runNovaSearchEngine(q);
      expect(slots.entityHint, q).toMatch(/avaada/i);
      expect(slots.suppressPersonHint, q).toBe(true);
      expect(isNovaPlaceFramedTaskAsk("tasks in avaada")).toBe(true);
    }
  });

  it("james school tasks → multi-word entity, not person", () => {
    const q = "james school tasks";
    const slots = runNovaSearchEngine(q);
    expect(slots.entityHint?.toLowerCase()).toMatch(/james school/);
    expect(slots.tools).toContain("tasks_summary");
    expect(slots.suppressPersonHint).toBe(true);
    expect(selectNovaTools(q)).toContain("tasks_summary");
  });
});
