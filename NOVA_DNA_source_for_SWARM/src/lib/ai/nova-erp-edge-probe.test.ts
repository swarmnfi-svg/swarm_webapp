/**
 * NOVA language edges after v3.1.75 — sticky person, tax phrases, task-edit open.
 * v3.1.81: sticky must not steal finance module-only; more GST/TDS phrasing; “the task”.
 */
import { describe, expect, it } from "vitest";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import {
  expandNovaLexicon,
  novaAcronymClarification,
} from "@/lib/ai/nova-lexicon";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import {
  emptyNovaDialogState,
  refreshNovaConversationSlots,
  stickyModuleFollowUpClarifyReason,
} from "@/lib/nova/dialog-state";
import { resolveNovaFollowUp } from "@/lib/ai/nova-context";
import { matchNovaSafeWorkflowOpen } from "@/lib/nova/safe-workflow";
import { isNovaWriteMutationQuery } from "@/lib/ai/nova-write-guards";

describe("sticky person module follow-up", () => {
  const dialogState = refreshNovaConversationSlots(emptyNovaDialogState(), {
    family: "tasks",
    personHint: "Arif",
    tools: ["tasks_summary"],
    module: "tasks",
    entityHint: null,
  });

  it("pending tasks after personHint reuses tasks_summary (no party clarify)", () => {
    expect(stickyModuleFollowUpClarifyReason("pending tasks", dialogState)).toBeNull();
    const pick = resolveNovaFollowUp("pending tasks", [], dialogState);
    expect(pick.isFollowUp).toBe(true);
    expect(pick.query.toLowerCase()).toMatch(/arif/);
    expect(pick.plan?.tools ?? pick.forcedTools ?? []).toContain("tasks_summary");
    expect(pick.plan?.person ?? "").toMatch(/Arif/i);
  });

  it("pending invoices after personHint does not force tasks_summary", () => {
    const pick = resolveNovaFollowUp("pending invoices", [], dialogState);
    expect(pick.query.toLowerCase()).not.toMatch(/arif/);
    expect(pick.plan?.tools ?? pick.forcedTools ?? []).not.toContain("tasks_summary");
  });

  it("pending receipts after personHint does not force tasks_summary", () => {
    const pick = resolveNovaFollowUp("pending receipts", [], dialogState);
    expect(pick.query.toLowerCase()).not.toMatch(/arif/);
    expect(pick.plan?.tools ?? pick.forcedTools ?? []).not.toContain("tasks_summary");
  });
});

describe("tax phrasing edges", () => {
  it("GST payable → gstr_snapshot", () => {
    expect(selectNovaTools(normalizeNovaQuery("GST payable"))).toContain("gstr_snapshot");
  });

  it("GST dues / liability / net GST → gstr (not receivables / entity search)", () => {
    for (const q of ["GST dues", "GST liability", "net GST"] as const) {
      const n = normalizeNovaQuery(q);
      expect(expandNovaLexicon(n), q).toMatch(/gstr/i);
      expect(selectNovaTools(n), q).toContain("gstr_snapshot");
      expect(selectNovaTools(n), q).not.toContain("receivables_summary");
    }
  });

  it("IGST/CGST/SGST payable + gst return → gstr", () => {
    for (const q of ["IGST payable", "CGST payable", "SGST payable", "gst return"] as const) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("gstr_snapshot");
    }
  });

  it("UGST/cess payable + ITC → gstr (not purchase-bill payables)", () => {
    for (const q of ["UGST payable", "cess payable", "ITC balance", "input tax credit"] as const) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("gstr_snapshot");
      expect(selectNovaTools(n), q).not.toContain("purchase_bills_summary");
    }
  });

  it("supplier/vendor ka baki → payables (not AR)", () => {
    for (const q of ["supplier ka baki", "vendor baki"] as const) {
      const n = normalizeNovaQuery(q);
      expect(expandNovaLexicon(n), q).toMatch(/payables/i);
      expect(selectNovaTools(n), q).not.toContain("receivables_summary");
      expect(selectNovaTools(n), q).not.toContain("customer_outstanding");
    }
  });

  it("AP / creditor baki → payables only (not dual AR)", () => {
    for (const q of ["AP baki", "creditor baki", "A/P outstanding"] as const) {
      const n = normalizeNovaQuery(q);
      expect(expandNovaLexicon(n), q).toMatch(/payables/i);
      expect(selectNovaTools(n), q).not.toContain("receivables_summary");
      expect(selectNovaTools(n), q).not.toContain("customer_outstanding");
    }
  });

  it("ewaybill compound → gst_docs_summary", () => {
    for (const q of ["ewaybill", "eway bill", "e-way bill"] as const) {
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("gst_docs_summary");
    }
  });

  it("input / output GST → gstr_snapshot", () => {
    for (const q of ["input GST", "output GST"] as const) {
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("gstr_snapshot");
    }
  });

  it("TDS outstanding clarifies (not receivables)", () => {
    const n = normalizeNovaQuery("TDS outstanding");
    expect(expandNovaLexicon("tds outstanding")).toMatch(/tds_clarify/i);
    const clarify = novaAcronymClarification(n) ?? novaAcronymClarification("TDS outstanding");
    expect(clarify?.answer).toMatch(/purchase bills/i);
    expect(selectNovaTools(n)).not.toContain("receivables_summary");
  });

  it("TDS liability clarifies like TDS dues", () => {
    const n = normalizeNovaQuery("TDS liability");
    expect(expandNovaLexicon(n)).toMatch(/tds_clarify/i);
    const clarify = novaAcronymClarification(n) ?? novaAcronymClarification("TDS liability");
    expect(clarify?.answer).toMatch(/purchase bills/i);
  });

  it("component GST outstanding/dues → gstr (not AR)", () => {
    for (const q of [
      "CGST outstanding",
      "IGST outstanding",
      "SGST outstanding",
      "UGST dues",
      "cess outstanding",
    ] as const) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("gstr_snapshot");
      expect(selectNovaTools(n), q).not.toContain("receivables_summary");
    }
  });

  it("input/output tax (+ payable) → gstr (not AP)", () => {
    for (const q of ["input tax", "output tax", "output tax payable"] as const) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("gstr_snapshot");
      expect(selectNovaTools(n), q).not.toContain("purchase_bills_summary");
    }
  });

  it("GST paid / GST challan → gstr (not delivery)", () => {
    for (const q of ["GST paid", "GST challan", "challan GST"] as const) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("gstr_snapshot");
      expect(selectNovaTools(n), q).not.toContain("delivery_summary");
    }
  });

  it("DN pending/open → credit notes (not entity search)", () => {
    for (const q of ["DN pending", "pending DN", "open DN"] as const) {
      const tools = selectNovaTools(normalizeNovaQuery(q));
      expect(tools, q).toContain("credit_notes_summary");
      expect(tools, q).not.toContain("search_entities");
    }
  });

  it("TCS outstanding clarifies (not AR/AP)", () => {
    const n = normalizeNovaQuery("TCS outstanding");
    expect(expandNovaLexicon(n)).toMatch(/tcs_clarify/i);
    const clarify = novaAcronymClarification(expandNovaLexicon(n)) ?? novaAcronymClarification(n);
    expect(clarify?.answer).toMatch(/TCS/i);
    expect(selectNovaTools(n)).not.toContain("receivables_summary");
    expect(selectNovaTools(n)).not.toContain("purchase_bills_summary");
  });

  it("PF/ESI dues → salary (not receivables)", () => {
    for (const q of ["PF dues", "ESI dues"] as const) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("salary_summary");
      expect(selectNovaTools(n), q).not.toContain("receivables_summary");
    }
  });

  it("JV pending/open → accounts (not entity search)", () => {
    for (const q of ["JV pending", "pending JV", "open JV", "journal voucher"] as const) {
      const tools = selectNovaTools(normalizeNovaQuery(q));
      expect(tools, q).toContain("accounts_snapshot");
      expect(tools, q).not.toContain("search_entities");
    }
  });

  it("IRN / IRN status → gst_docs", () => {
    for (const q of ["IRN", "IRN status"] as const) {
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("gst_docs_summary");
    }
  });

  it("WHT / withholding tax clarifies like TDS", () => {
    for (const q of ["WHT", "withholding tax", "WHT payable"] as const) {
      const n = normalizeNovaQuery(q);
      const expanded = expandNovaLexicon(n);
      expect(expanded, q).toMatch(/tds_clarify/i);
      const clarify =
        novaAcronymClarification(expanded) ?? novaAcronymClarification(n) ?? novaAcronymClarification(q);
      expect(clarify?.answer, q).toMatch(/TDS|WHT/i);
      expect(selectNovaTools(n), q).not.toContain("purchase_bills_summary");
    }
  });

  it("CN GST → credit notes (not entity search)", () => {
    for (const q of ["CN GST", "GST CN"] as const) {
      const tools = selectNovaTools(normalizeNovaQuery(q));
      expect(tools, q).toContain("credit_notes_summary");
      expect(tools, q).not.toContain("search_entities");
    }
  });

  it("professional tax / PT dues → salary (not AR)", () => {
    for (const q of ["professional tax", "PT dues"] as const) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("salary_summary");
      expect(selectNovaTools(n), q).not.toContain("receivables_summary");
    }
  });

  it("RCM / reverse charge / GST refund → gstr", () => {
    for (const q of ["RCM", "reverse charge", "GST refund", "B2B GST"] as const) {
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("gstr_snapshot");
    }
  });

  it("bank contra → bank_recon (not entity search)", () => {
    for (const q of ["contra entry", "bank contra"] as const) {
      const tools = selectNovaTools(normalizeNovaQuery(q));
      expect(tools, q).toContain("bank_recon_summary");
      expect(tools, q).not.toContain("search_entities");
    }
  });

  it("bare proforma → sales", () => {
    expect(selectNovaTools(normalizeNovaQuery("proforma"))).toContain("sales_summary");
  });
});

describe("task-edit safe workflow", () => {
  it("matches clear edit-titled asks and skips bare edit task", () => {
    const m = matchNovaSafeWorkflowOpen("edit task titled Review Site Photos");
    expect(m).toMatchObject({ formId: "task_edit", titleHint: "Review Site Photos" });
    expect(matchNovaSafeWorkflowOpen("edit the task titled Review Site Photos")).toMatchObject({
      formId: "task_edit",
      titleHint: "Review Site Photos",
    });
    expect(matchNovaSafeWorkflowOpen("edit task")).toBeNull();
    expect(matchNovaSafeWorkflowOpen("create task titled Review Site Photos")).toMatchObject({
      formId: "task_new",
    });
  });

  it("clear edit ask is not write-mutation (open form only)", () => {
    expect(isNovaWriteMutationQuery("edit task titled Review Site Photos")).toBe(false);
    expect(isNovaWriteMutationQuery("delete task titled Review Site Photos")).toBe(true);
  });
});
