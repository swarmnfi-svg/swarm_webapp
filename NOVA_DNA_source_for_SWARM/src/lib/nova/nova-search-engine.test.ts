import { describe, expect, it } from "vitest";
import {
  looksLikePartyOrProjectName,
  novaSearchEngineIsDecisive,
  novaSearchKindForEntityType,
  runNovaSearchEngine,
  validateNovaSearchSlots,
} from "@/lib/nova/nova-search-engine";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { composeNovaIntent } from "@/lib/ai/nova-intent";
import {
  buildNovaPlan,
  finalizeNovaPlan,
  novaPlanHasReadyTools,
  shouldClarifyNovaPlan,
} from "@/lib/ai/nova-plan";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { novaAmbiguityClarification } from "@/lib/ai/nova-dates";
import { buildEntityClarifyCard, formatNovaClarifyCard } from "@/lib/ai/nova-clarify";

describe("NovaSearchEngine goldens", () => {
  it("find projects named tata → search family, not projects_summary", () => {
    const slots = runNovaSearchEngine("find projects named tata");
    expect(slots.queryFamily).toBe("search");
    expect(slots.entityType).toBe("project");
    expect(slots.entityHint?.toLowerCase()).toBe("tata");
    expect(slots.period).toBeNull();
    expect(slots.tools).toEqual(["search_entities"]);
    expect(slots.tools).not.toContain("projects_summary");
    expect(novaSearchEngineIsDecisive(slots)).toBe(true);

    const nq = normalizeNovaQuery("find projects named tata");
    expect(selectNovaTools(nq)).toEqual(["search_entities"]);
    expect(selectNovaTools(nq)).not.toContain("projects_summary");
    expect(composeNovaIntent(nq).tools).toEqual(["search_entities"]);

    const plan = buildNovaPlan(nq);
    expect(plan.tools).toEqual(["search_entities"]);
    expect(plan.entity?.toLowerCase()).toBe("tata");
    expect(plan.period).toBeUndefined();
    expect(plan.source).toBe("search_engine");
    expect(novaPlanHasReadyTools(plan)).toBe(true);
    expect(shouldClarifyNovaPlan(plan)).toBe(false);
  });

  it("projects named X → search, no FY / projects_summary", () => {
    const slots = runNovaSearchEngine("projects named Acme Plant");
    expect(slots.queryFamily).toBe("search");
    expect(slots.entityType).toBe("project");
    expect(slots.entityHint).toMatch(/Acme Plant/i);
    expect(slots.period).toBeNull();
    expect(slots.tools).toEqual(["search_entities"]);
    expect(selectNovaTools("projects named Acme Plant")).toEqual(["search_entities"]);
    expect(selectNovaTools("projects named Acme Plant")).not.toContain("projects_summary");
  });

  it("tata steel bare → resolve + search_entities (not projects_summary / FY)", () => {
    const slots = runNovaSearchEngine("tata steel");
    expect(slots.queryFamily).toBe("resolve");
    expect(slots.tools).toEqual(["search_entities"]);
    expect(slots.tools).not.toContain("projects_summary");
    expect(slots.entityHint?.toLowerCase()).toBe("tata steel");

    const nq = normalizeNovaQuery("tata steel");
    const plan = finalizeNovaPlan(buildNovaPlan(nq), {
      ambiguityClarify: novaAmbiguityClarification(nq),
    });
    expect(plan.tools).toEqual(["search_entities"]);
    expect(plan.tools).not.toContain("projects_summary");
    expect(novaPlanHasReadyTools(plan)).toBe(true);
    expect(shouldClarifyNovaPlan(plan)).toBe(false);
  });

  it("who is arun → people + staff_summary (not unmatched catalog)", () => {
    const slots = runNovaSearchEngine("who is arun");
    expect(slots.queryFamily).toBe("people");
    expect(slots.entityType).toBe("employee");
    expect(slots.entityHint?.toLowerCase()).toBe("arun");
    expect(slots.tools).toEqual(["staff_summary"]);
    expect(novaSearchEngineIsDecisive(slots)).toBe(true);

    expect(selectNovaTools("who is arun")).toEqual(["staff_summary"]);
    const plan = buildNovaPlan("who is arun");
    expect(plan.tools).toEqual(["staff_summary"]);
    expect(plan.person?.toLowerCase()).toBe("arun");
    expect(novaPlanHasReadyTools(plan)).toBe(true);
  });

  it("who is late stays attendance (not people)", () => {
    const slots = runNovaSearchEngine("who is late");
    expect(slots.queryFamily).not.toBe("people");
    expect(selectNovaTools("who is late")).toEqual(["attendance_late_summary"]);
  });

  it("find staff Zeeshan → staff_summary", () => {
    const slots = runNovaSearchEngine("find staff Zeeshan");
    expect(slots.queryFamily).toBe("people");
    expect(slots.tools).toEqual(["staff_summary"]);
    expect(selectNovaTools("find staff Zeeshan")).toEqual(["staff_summary"]);
  });

  it("what is Avaada → search_entities", () => {
    const slots = runNovaSearchEngine("what is Avaada");
    expect(slots.queryFamily).toBe("search");
    expect(slots.tools).toEqual(["search_entities"]);
    expect(slots.entityHint).toMatch(/Avaada/i);
  });

  it("tasks pending in tata steels 800 → tasks_summary + project entity (not org-wide person)", () => {
    const q = "tasks pending in tata steels 800";
    const slots = runNovaSearchEngine(q);
    expect(slots.queryFamily).toBe("status");
    expect(slots.tools).toEqual(["tasks_summary"]);
    expect(slots.entityType).toBe("project");
    expect(slots.entityHint?.toLowerCase()).toMatch(/tata steels 800/);
    expect(slots.suppressPersonHint).toBe(true);
    expect(novaSearchEngineIsDecisive(slots)).toBe(true);

    const intent = composeNovaIntent(q);
    expect(intent.tools).toEqual(["tasks_summary"]);
    expect(intent.slots.some((s) => s.kind === "entity" && /tata/i.test(s.name))).toBe(true);
    expect(intent.slots.some((s) => s.kind === "person")).toBe(false);

    const plan = buildNovaPlan(q);
    expect(plan.tools).toEqual(["tasks_summary"]);
    expect(plan.entity?.toLowerCase()).toMatch(/tata steels 800/);
    expect(plan.module).toBe("tasks");
    // Recipe may own project-scoped task phrasing as project_command
    expect(["tasks_summary", "project_command"]).toContain(selectNovaTools(q)[0]);
  });

  it("pending tasks for tata steels 800 → project entity, not personHint", () => {
    const q = "pending tasks for tata steels 800";
    const slots = runNovaSearchEngine(q);
    expect(slots.entityHint?.toLowerCase()).toMatch(/tata steels 800/);
    expect(slots.suppressPersonHint).toBe(true);
    expect(composeNovaIntent(q).slots.some((s) => s.kind === "person")).toBe(false);
    expect(selectNovaTools(q)).toEqual(["tasks_summary"]);
  });

  it("active projects value still uses projects_summary (money, not name search)", () => {
    const slots = runNovaSearchEngine("active projects value");
    expect(slots.queryFamily).not.toBe("search");
    expect(selectNovaTools("active projects value")).toContain("projects_summary");
  });

  it("bare attendance period stays attendance (not search steal)", () => {
    const slots = runNovaSearchEngine("attendance today");
    expect(slots.queryFamily).toBe("attendance");
    expect(selectNovaTools("attendance today")).toEqual(["attendance_late_summary"]);
  });

  it("write asks → deny_write family", () => {
    const slots = runNovaSearchEngine("please create a new invoice");
    expect(slots.queryFamily).toBe("deny_write");
    expect(slots.tools).toEqual([]);
  });

  it("maps entity types to Empower search kinds", () => {
    expect(novaSearchKindForEntityType("project")).toBe("Project");
    expect(novaSearchKindForEntityType("customer")).toBe("Customer");
    expect(novaSearchKindForEntityType("vendor")).toBe("Vendor");
    expect(novaSearchKindForEntityType("employee")).toBe("Staff");
    expect(novaSearchKindForEntityType("task")).toBe("Task");
    expect(novaSearchKindForEntityType("quotation")).toBe("CBG Quotation");
    expect(novaSearchKindForEntityType("purchase_order")).toBe("Purchase Order");
    expect(novaSearchKindForEntityType("purchase_request")).toBe("Purchase Request");
    expect(novaSearchKindForEntityType("purchase_bill")).toBe("Purchase Bill");
    expect(novaSearchKindForEntityType("receipt")).toBe("Receipt");
    expect(novaSearchKindForEntityType("payment_request")).toBe("Payment Request");
    expect(novaSearchKindForEntityType("expense")).toBe("Expense");
    expect(novaSearchKindForEntityType("approval")).toBe("Approval");
    expect(novaSearchKindForEntityType("leave")).toBe("Leave");
    expect(novaSearchKindForEntityType("bank_account")).toBe("Bank Account");
  });

  it("TSK id → search_entities task lookup", () => {
    const slots = runNovaSearchEngine("TSK-2026-0055");
    expect(slots.queryFamily).toBe("search");
    expect(slots.entityType).toBe("task");
    expect(slots.entityHint).toBe("TSK-2026-0055");
    expect(slots.tools).toEqual(["search_entities"]);
    expect(slots.tools).not.toContain("tasks_summary");
  });

  it("find task named LNCPE → search_entities (not tasks_summary counts)", () => {
    const slots = runNovaSearchEngine("find task named LNCPE -QUOTATION 3");
    expect(slots.queryFamily).toBe("search");
    expect(slots.entityType).toBe("task");
    expect(slots.entityHint?.toLowerCase()).toMatch(/lncpe/);
    expect(slots.tools).toEqual(["search_entities"]);
  });

  it("find quotation / APR / expense ids → search_entities (not summary packs)", () => {
    const q = runNovaSearchEngine("find quotation named Acme Bio");
    expect(q.queryFamily).toBe("search");
    expect(q.entityType).toBe("quotation");
    expect(q.tools).toEqual(["search_entities"]);
    expect(q.tools).not.toContain("cbg_quotations_summary");

    const apr = runNovaSearchEngine("APR-2026-00012");
    expect(apr.queryFamily).toBe("search");
    expect(apr.entityType).toBe("approval");
    expect(apr.tools).toEqual(["search_entities"]);

    const exp = runNovaSearchEngine("find expense EXP-100");
    expect(exp.queryFamily).toBe("search");
    expect(exp.entityType).toBe("expense");
    expect(exp.tools).toEqual(["search_entities"]);
    expect(selectNovaTools(normalizeNovaQuery("staff expenses"))).toContain(
      "staff_expense_summary"
    );
  });

  it("find purchase order / bank account → search; bare approvals stay summary family", () => {
    const po = runNovaSearchEngine("find purchase order named Tata Steel");
    expect(po.queryFamily).toBe("search");
    expect(po.entityType).toBe("purchase_order");
    expect(po.tools).toEqual(["search_entities"]);

    const bank = runNovaSearchEngine("find bank account HDFC Ops");
    expect(bank.queryFamily).toBe("search");
    expect(bank.entityType).toBe("bank_account");
    expect(bank.tools).toEqual(["search_entities"]);

    const approvals = runNovaSearchEngine("approvals");
    expect(approvals.queryFamily).toBe("approvals");
    expect(approvals.tools).not.toEqual(["search_entities"]);
  });

  it("validateNovaSearchSlots drops invented tools", () => {
    const v = validateNovaSearchSlots(
      {
        intent: "hack",
        queryFamily: "money",
        tools: ["sales_summary", "DROP_TABLE", "invented_tool"],
        confidence: "high",
        entityHint: "Avaada",
      },
      new Set(["sales_summary", "receipts_summary"])
    );
    expect(v?.tools).toEqual(["sales_summary"]);
    expect(v?.entityHint).toBe("Avaada");
  });

  it("looksLikePartyOrProjectName", () => {
    expect(looksLikePartyOrProjectName("tata steels 800")).toBe(true);
    expect(looksLikePartyOrProjectName("Zeeshan")).toBe(false);
    expect(looksLikePartyOrProjectName("James School")).toBe(true);
  });

  it("MM-T-AVAADA: tasks in avaada / Avaada project task / avaada tasks → project-scoped tasks", () => {
    for (const q of [
      "tasks in avaada",
      "Avaada project task",
      "avaada tasks",
      "james school project task",
    ] as const) {
      const slots = runNovaSearchEngine(q);
      expect(slots.entityHint, q).toBeTruthy();
      expect(slots.entityHint, q).not.toMatch(/\b(project|tasks?)\b/i);
      expect(slots.suppressPersonHint, q).toBe(true);
      expect(slots.tools, q).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^(tasks_summary|project_command)$/),
        ])
      );
      expect(slots.tools.length, q).toBeGreaterThan(0);
      expect(composeNovaIntent(q).slots.some((s) => s.kind === "person"), q).toBe(false);
      expect(
        composeNovaIntent(q).slots.some((s) => s.kind === "entity"),
        q
      ).toBe(true);
      const tools = selectNovaTools(q);
      expect(tools[0], q).toMatch(/^(tasks_summary|project_command)$/);
    }
  });

  it("MM-T1: tata steel tasks → entity not person, tasks_summary, suppressPerson", () => {
    const q = "tata steel tasks";
    const slots = runNovaSearchEngine(q);
    expect(slots.queryFamily).toBe("status");
    expect(slots.tools).toEqual(["tasks_summary"]);
    expect(slots.entityType).toBe("project");
    expect(slots.entityHint?.toLowerCase()).toMatch(/tata steel/);
    expect(slots.suppressPersonHint).toBe(true);
    expect(novaSearchEngineIsDecisive(slots)).toBe(true);

    const intent = composeNovaIntent(q);
    expect(intent.tools).toEqual(["tasks_summary"]);
    expect(intent.slots.some((s) => s.kind === "person")).toBe(false);
    expect(intent.slots.some((s) => s.kind === "entity" && /tata/i.test(s.name))).toBe(true);

    const plan = buildNovaPlan(q);
    expect(plan.tools).toEqual(["tasks_summary"]);
    expect(plan.entity?.toLowerCase()).toMatch(/tata steel/);
    expect(plan.person).toBeFalsy();
    expect(selectNovaTools(q)).toEqual(["tasks_summary"]);
  });

  it("MM-T2: tata steels tasks → same entity bind", () => {
    const q = "tata steels tasks";
    const slots = runNovaSearchEngine(q);
    expect(slots.entityHint?.toLowerCase()).toMatch(/tata steels/);
    expect(slots.suppressPersonHint).toBe(true);
    expect(slots.tools).toEqual(["tasks_summary"]);
    expect(composeNovaIntent(q).slots.some((s) => s.kind === "person")).toBe(false);
  });

  it("MM-T3: James School tasks → entity not person, scoped tasks", () => {
    const q = "James School tasks";
    const slots = runNovaSearchEngine(q);
    expect(slots.entityHint?.toLowerCase()).toMatch(/james school/);
    expect(slots.suppressPersonHint).toBe(true);
    expect(slots.tools).toEqual(["tasks_summary"]);
    expect(composeNovaIntent(q).slots.some((s) => s.kind === "person")).toBe(false);
    expect(selectNovaTools(q)).toEqual(["tasks_summary"]);
  });

  it("ST-T1: aalok tasks → try entity then person path (not silent org-wide)", () => {
    const q = "aalok tasks";
    const slots = runNovaSearchEngine(q);
    // Single-token brand/party gate now binds; tools demote to person when no party exists.
    expect(slots.entityHint?.toLowerCase()).toBe("aalok");
    expect(slots.suppressPersonHint).toBe(true);
    expect(slots.tools).toEqual(["tasks_summary"]);
    expect(novaSearchEngineIsDecisive(slots)).toBe(true);

    const intent = composeNovaIntent(q);
    expect(intent.slots.some((s) => s.kind === "entity" && /aalok/i.test(s.name))).toBe(true);
    expect(intent.tools).toContain("tasks_summary");
    expect(selectNovaTools(q)).toContain("tasks_summary");
  });

  it("MM-I1 / MM-R1: Avaada invoices|receipts → entity + money, not staff", () => {
    for (const [q, tool] of [
      ["Avaada invoices", "sales_summary"],
      ["Avaada receipts", "receipts_summary"],
    ] as const) {
      const slots = runNovaSearchEngine(q);
      expect(slots.entityHint, q).toMatch(/Avaada/i);
      expect(slots.suppressPersonHint, q).toBe(true);
      expect(slots.tools, q).toEqual([tool]);
      expect(composeNovaIntent(q).slots.some((s) => s.kind === "person"), q).toBe(false);
      expect(selectNovaTools(q), q).toEqual([tool]);
    }
  });

  it("MM-SO / MM-AR / MM-CN / MM-EX / MM-PR / MM-DL / MM-GRN: more {entity}+{module} binds", () => {
    const cases: Array<[string, string[], RegExp]> = [
      ["Avaada sales orders", ["sales_orders_summary"], /avaada/i],
      ["tata steel SO", ["sales_orders_summary"], /tata steel/i],
      ["Avaada receivables", ["receivables_summary", "customer_outstanding"], /avaada/i],
      ["tata steel outstanding", ["receivables_summary", "customer_outstanding"], /tata steel/i],
      ["pending payment from James school", ["receivables_summary", "customer_outstanding"], /james school/i],
      ["payment receivable from Avaada", ["receivables_summary", "customer_outstanding"], /avaada/i],
      ["Avaada credit notes", ["credit_notes_summary"], /avaada/i],
      ["tata steel expenses", ["staff_expense_summary"], /tata steel/i],
      ["Avaada payment requests", ["payment_requests_summary"], /avaada/i],
      ["James School delivery", ["delivery_summary"], /james school/i],
      ["tata steel GRN", ["grn_summary"], /tata steel/i],
      ["Avaada goods receipt", ["grn_summary"], /avaada/i],
    ];
    for (const [q, tools, hint] of cases) {
      const slots = runNovaSearchEngine(q);
      expect(slots.entityHint, q).toMatch(hint);
      expect(slots.suppressPersonHint, q).toBe(true);
      expect(slots.tools, q).toEqual(tools);
      expect(novaSearchEngineIsDecisive(slots), q).toBe(true);
      expect(composeNovaIntent(q).slots.some((s) => s.kind === "person"), q).toBe(false);
      expect(selectNovaTools(q), q).toEqual(tools);
    }
  });

  it("MM staff gate: aalok tasks try-entity-then-person; money single-token still clarifies (not silent staff)", () => {
    // Tasks: single-token may bind entity; tools demote to person when party miss
    const tasks = runNovaSearchEngine("aalok tasks");
    expect(tasks.entityHint?.toLowerCase()).toBe("aalok");
    expect(tasks.suppressPersonHint).toBe(true);
    expect(tasks.tools).toEqual(["tasks_summary"]);

    // Money modules allow single-token parties (Avaada); clarify chips cover staff collision
    const so = runNovaSearchEngine("Avaada sales orders");
    expect(so.entityHint).toMatch(/Avaada/i);
    expect(so.suppressPersonHint).toBe(true);
    expect(so.tools).toEqual(["sales_orders_summary"]);
  });

  it("POL-1: party+bank does not soft-bind — bank stays RBAC-hard", () => {
    for (const q of ["Avaada bank", "Avaada bank accounts", "tata steel banking"] as const) {
      const slots = runNovaSearchEngine(q);
      expect(slots.tools, q).not.toEqual(expect.arrayContaining(["bank_accounts_summary"]));
      expect(slots.intent, q).not.toMatch(/_for_entity$/);
      // Lexicon may still select bank tools; SearchEngine must not invent party+bank bind
      expect(slots.suppressPersonHint && slots.entityHint && /bank/i.test(q) && slots.tools.includes("bank_accounts_summary"), q).toBeFalsy();
    }
    // Bare bank phrases stay on RBAC catalog path (not entity-scoped)
    expect(selectNovaTools("bank accounts")).toContain("bank_accounts_summary");
  });

  it("MM-D1: tata steel documents → docs + entity", () => {
    const q = "tata steel documents";
    const slots = runNovaSearchEngine(q);
    expect(slots.queryFamily).toBe("docs");
    expect(slots.tools).toEqual(["documents_search"]);
    expect(slots.entityHint?.toLowerCase()).toMatch(/tata steel/);
    expect(slots.suppressPersonHint).toBe(true);
    expect(selectNovaTools(q)).toEqual(["documents_search"]);
  });

  it("tata p&id / Tata Steels P&ID → documents_search for party", () => {
    for (const q of ["tata p&id", "tata steels P&id", "Tata Steels P&ID"]) {
      const slots = runNovaSearchEngine(q);
      expect(slots.queryFamily, q).toBe("docs");
      expect(slots.tools, q).toEqual(["documents_search"]);
      expect(slots.entityHint?.toLowerCase(), q).toMatch(/tata/);
      expect(slots.suppressPersonHint, q).toBe(true);
      expect(selectNovaTools(q), q).toEqual(["documents_search"]);
    }
  });

  it("ambiguous clarify card labels Customer vs Project vs Staff", () => {
    const card = buildEntityClarifyCard("Acme", [
      { id: "c1", label: "Acme Corp", type: "customer", code: "C001" },
      { id: "p1", label: "Acme Plant", type: "project", code: "P001" },
      { id: "s1", label: "Acme Singh", type: "staff", code: "ST-01" },
    ]);
    const text = formatNovaClarifyCard(card);
    expect(text).toMatch(/customer/i);
    expect(text).toMatch(/project/i);
    expect(text).toMatch(/staff/i);
    expect(text).toMatch(/1\.\s+\*\*Acme Corp\*\*/);
    expect(card.options.map((o) => o.type)).toEqual(["customer", "project", "staff"]);
  });

  it("NEG: create tata steel task → deny_write; bare tata steel stays resolve", () => {
    expect(runNovaSearchEngine("create tata steel task").queryFamily).toBe("deny_write");
    const bare = runNovaSearchEngine("tata steel");
    expect(bare.queryFamily).toBe("resolve");
    expect(bare.tools).toEqual(["search_entities"]);
  });

  it("James School work/tasks/photos → project_command, not FY projects_summary", () => {
    const q =
      "Could you please share the complete details of the work carried out at the James School project, including who was responsible for each task? Also, if you have any plant photos, site images, or other related pictures available, kindly share them with me.";
    const slots = runNovaSearchEngine(q);
    expect(slots.intent).toBe("named_project_detail");
    expect(slots.entityType).toBe("project");
    expect(slots.entityHint?.toLowerCase()).toMatch(/james school/);
    expect(slots.tools[0]).toBe("project_command");
    expect(slots.tools).toContain("documents_search");
    expect(slots.tools).not.toContain("projects_summary");
    expect(slots.tools).not.toContain("search_entities");

    const tools = selectNovaTools(q);
    expect(tools[0]).toBe("project_command");
    expect(tools).toContain("documents_search");
    expect(tools).not.toContain("projects_summary");
    expect(tools).not.toContain("search_entities");
  });

  it("find/lookup still uses search_entities; portfolio stays projects_summary", () => {
    expect(selectNovaTools("projects named Acme Plant")).toEqual(["search_entities"]);
    expect(selectNovaTools("find James School")).toContain("search_entities");
    expect(selectNovaTools("biggest project")).toContain("projects_summary");
    expect(selectNovaTools("active projects value")).toContain("projects_summary");
  });

  it("finance report / bare reports are not entity-resolve steals", () => {
    for (const q of ["finance report", "reports", "report", "ERP reports"]) {
      const slots = runNovaSearchEngine(q);
      expect(slots.queryFamily, q).not.toBe("resolve");
      expect(slots.tools, q).not.toEqual(["search_entities"]);
    }
    expect(selectNovaTools("finance report")).toEqual([]);
    expect(selectNovaTools("reports")).toEqual(
      expect.arrayContaining(["reports_snapshot"])
    );
    expect(selectNovaTools("reports")).not.toContain("search_entities");
    expect(selectNovaTools(normalizeNovaQuery("staff expenses"))).toContain(
      "staff_expense_summary"
    );
  });

  it("module/open phrases are not bare-resolve stolen", () => {
    for (const [q, tool] of [
      ["purchase bills", "purchase_bills_summary"],
      ["credit notes", "credit_notes_summary"],
      ["payment requests", "payment_requests_summary"],
      ["backup", "backup_open"],
      ["theme", "appearance_open"],
      ["appearance", "appearance_open"],
      ["system tools", "system_tools_open"],
      ["audit log", "audit_log_open"],
      ["files", "documents_open"],
      ["accounts ledger", "accounts_snapshot"],
    ] as const) {
      const slots = runNovaSearchEngine(q);
      expect(slots.queryFamily, q).not.toBe("resolve");
      expect(selectNovaTools(q), q).toContain(tool);
      expect(selectNovaTools(q), q).not.toContain("search_entities");
    }
  });

  it("single-token bare party clarifies (empty tools); multi-word keeps search", () => {
    const acme = runNovaSearchEngine("Acme");
    expect(acme.queryFamily).toBe("resolve");
    expect(acme.tools).toEqual([]);
    expect(selectNovaTools("Acme")).toEqual([]);

    const tata = runNovaSearchEngine("Tata Steels");
    expect(tata.queryFamily).toBe("resolve");
    expect(tata.tools).toEqual(["search_entities"]);
  });

  it("SRI RAMA / long mill name / SEARCH: prefix → entity search (not metric junk)", () => {
    const short = runNovaSearchEngine("SRI RAMA");
    expect(short.queryFamily).toBe("resolve");
    expect(short.entityHint).toBe("SRI RAMA");
    expect(short.tools).toEqual(["search_entities"]);
    expect(short.searchQuery).toBe("SRI RAMA");
    expect(selectNovaTools("SRI RAMA")).toEqual(["search_entities"]);

    const full = "SRI RAMA MODERN AND PARA BOILED RICE MILL";
    const long = runNovaSearchEngine(full);
    expect(long.queryFamily).toBe("resolve");
    expect(long.entityHint).toBe(full);
    expect(long.tools).toEqual(["search_entities"]);
    expect(long.searchQuery).toBe(full);
    expect(selectNovaTools(full)).toEqual(["search_entities"]);

    for (const q of ["SEARCH: SRI RAMA", "Search: SRI RAMA", "FIND: SRI RAMA"]) {
      const slots = runNovaSearchEngine(q);
      expect(slots.queryFamily, q).toBe("search");
      expect(slots.tools, q).toEqual(["search_entities"]);
      expect(slots.entityHint, q).toBe("SRI RAMA");
      expect(slots.searchQuery, q).toBe("SRI RAMA");
      expect(slots.entityHint, q).not.toMatch(/^:/);
    }
  });
});
