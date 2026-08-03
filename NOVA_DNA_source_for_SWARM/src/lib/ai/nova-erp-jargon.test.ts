/**
 * Indian ERP jargon + logical clarify locks for NOVA language routing.
 */
import { describe, expect, it } from "vitest";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import {
  expandNovaLexicon,
  novaAcronymClarification,
} from "@/lib/ai/nova-lexicon";
import { selectNovaTools } from "@/lib/ai/nova-tools";

describe("ERP jargon routing", () => {
  it("routes supplier/vendor bill to purchase bills (not vendor list)", () => {
    for (const q of ["supplier bill", "supplier bills", "vendor bill", "vendor bills"]) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("purchase_bills_summary");
      expect(selectNovaTools(n), q).not.toContain("vendors_summary");
    }
  });

  it("routes party/debtor outstanding to customer_outstanding (not bare receivables dump)", () => {
    for (const q of ["party outstanding", "debtor outstanding", "customer OS", "party OS"]) {
      const n = normalizeNovaQuery(q);
      expect(expandNovaLexicon(q.toLowerCase())).toMatch(/customer_outstanding/i);
      expect(selectNovaTools(n), q).toContain("customer_outstanding");
    }
  });

  it("routes pending/open SO and PO to order tools", () => {
    expect(selectNovaTools(normalizeNovaQuery("pending SO"))).toContain("sales_orders_summary");
    expect(selectNovaTools(normalizeNovaQuery("open SO"))).toContain("sales_orders_summary");
    expect(selectNovaTools(normalizeNovaQuery("pending PO"))).toContain(
      "purchase_orders_summary"
    );
    expect(selectNovaTools(normalizeNovaQuery("open PO"))).toContain("purchase_orders_summary");
  });

  it("clarifies ambiguous PR status asks instead of search_entities or silent payment bind", () => {
    for (const q of ["PR", "pending PR", "open PR", "PR pending", "raise PR"]) {
      const clarify = novaAcronymClarification(q);
      expect(clarify, q).not.toBeNull();
      expect(clarify!.answer).toMatch(/payment requests/i);
      expect(clarify!.answer).toMatch(/purchase requests/i);
      // Must not silently pick payment_requests via expand
      expect(expandNovaLexicon(q.toLowerCase())).not.toMatch(/^payment requests$/i);
    }
  });

  it("explicit purchase/indent PR expands to purchase requests", () => {
    expect(selectNovaTools(normalizeNovaQuery("purchase PR"))).toContain(
      "purchase_requests_summary"
    );
    expect(selectNovaTools(normalizeNovaQuery("material indent"))).toContain(
      "purchase_requests_summary"
    );
    expect(selectNovaTools(normalizeNovaQuery("indent PR"))).toContain(
      "purchase_requests_summary"
    );
  });

  it("explicit payment PR expands to payment requests", () => {
    expect(selectNovaTools(normalizeNovaQuery("payment PR"))).toContain(
      "payment_requests_summary"
    );
  });

  it("normalizes regularise/regularize spelling to regularisation routing", () => {
    expect(selectNovaTools(normalizeNovaQuery("regularize pending"))).toContain(
      "regularisation_summary"
    );
    expect(selectNovaTools(normalizeNovaQuery("regularise pending"))).toContain(
      "regularisation_summary"
    );
  });

  it("routes GP/gross margin to profitability", () => {
    expect(selectNovaTools(normalizeNovaQuery("gross margin"))).toContain(
      "profitability_summary"
    );
    expect(selectNovaTools(normalizeNovaQuery("GP margin"))).toContain(
      "profitability_summary"
    );
  });

  it("routes vendor/supplier outstanding to payables (not customer AR)", () => {
    for (const q of ["vendor outstanding", "supplier outstanding", "vendors outstanding"]) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("purchase_bills_summary");
      expect(selectNovaTools(n), q).not.toContain("receivables_summary");
      expect(selectNovaTools(n), q).not.toContain("customer_outstanding");
    }
  });

  it("routes Hinglish udhaar/baki dues to receivables (not receipts or empty)", () => {
    for (const q of [
      "udhaar",
      "udhaar kitna",
      "baki amount",
      "baaki paisa",
      "kitna baki",
      "pending dues",
      "dues",
    ]) {
      const tools = selectNovaTools(normalizeNovaQuery(q));
      expect(tools, q).toContain("receivables_summary");
      expect(tools, q).not.toContain("receipts_summary");
    }
  });

  it("routes party/client ka OS to customer_outstanding", () => {
    for (const q of ["party ka OS", "party ka outstanding", "client ke outstanding"]) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("customer_outstanding");
    }
  });

  it("routes CN pending/open to credit notes (not entity search)", () => {
    for (const q of ["CN pending", "pending CN", "open CN", "CN list"]) {
      const tools = selectNovaTools(normalizeNovaQuery(q));
      expect(tools, q).toContain("credit_notes_summary");
      expect(tools, q).not.toContain("search_entities");
    }
  });

  it("routes GST payable / outstanding to GSTR (not AP bills or AR)", () => {
    for (const q of ["GST payable", "gst payable", "net GST payable", "GST outstanding"]) {
      const n = normalizeNovaQuery(q);
      expect(selectNovaTools(n), q).toContain("gstr_snapshot");
      expect(selectNovaTools(n), q).not.toContain("purchase_bills_summary");
      expect(selectNovaTools(n), q).not.toContain("receivables_summary");
    }
  });

  it("clarifies TDS outstanding/payable instead of inventing AR or a TDS money tool", () => {
    for (const q of ["TDS outstanding", "tds payable", "TDS", "tds dues"]) {
      const n = normalizeNovaQuery(q);
      const clarify = novaAcronymClarification(n) ?? novaAcronymClarification(q);
      expect(clarify, q).not.toBeNull();
      expect(clarify!.answer, q).toMatch(/TDS/i);
      expect(clarify!.answer, q).toMatch(/purchase bills|accounts ledger|GSTR/i);
      expect(selectNovaTools(n), q).not.toContain("receivables_summary");
      expect(selectNovaTools(n), q).not.toContain("customer_outstanding");
    }
  });
});
