/**
 * PREP goldens — polished formatters preserve counts/money and use card/bullet layout.
 * No ERP / LLM. Safe to run before merge.
 */

import { describe, expect, it } from "vitest";
import {
  formatPrepPolishedFact,
  formatPrepPolishedFacts,
  prepPresentationModeForTool,
  PREP_POLISHED_FORMATTER_TOOLS,
  PRESENTATION_POLISH_PREP_VERSION,
} from "@/lib/nova/presentation";
import { formatSalesSummaryPolished } from "@/lib/nova/presentation/sales";
import { formatReceiptsSummaryPolished } from "@/lib/nova/presentation/receipts";
import { formatTasksSummaryPolished } from "@/lib/nova/presentation/tasks";
import { formatApprovalsSummaryPolished } from "@/lib/nova/presentation/approvals";
import { formatBankAccountsSummaryPolished } from "@/lib/nova/presentation/bank";
import { formatCustomersSummaryPolished } from "@/lib/nova/presentation/customers";

describe("presentation polish PREP", () => {
  it("exposes prep version and formatter tool list", () => {
    expect(PRESENTATION_POLISH_PREP_VERSION).toBeTruthy();
    expect(PREP_POLISHED_FORMATTER_TOOLS).toContain("sales_summary");
    expect(PREP_POLISHED_FORMATTER_TOOLS).toContain("approvals_summary");
  });

  it("mode maps converge with nova-presentation core", async () => {
    const core = await import("@/lib/ai/nova-presentation");
    // Money packs (sales/receipts) are deterministic_polished under the money-guard:
    // same ERP facts → same answer, never LLM-narrated (see NOVA_DETERMINISTIC_POLISHED_TOOLS).
    expect(prepPresentationModeForTool("sales_summary")).toBe("deterministic_polished");
    expect(prepPresentationModeForTool("approvals_summary")).toBe("deterministic_polished");
    expect(prepPresentationModeForTool("bank_accounts_summary")).toBe(
      "deterministic_polished"
    );
    expect(core.NOVA_DETERMINISTIC_POLISHED_TOOLS.has("sales_summary")).toBe(true);
    expect(core.NOVA_HYBRID_GUARDED_TOOLS.has("sales_summary")).toBe(false);
    expect(core.NOVA_DETERMINISTIC_POLISHED_TOOLS.has("approvals_summary")).toBe(true);
    expect(core.NOVA_DETERMINISTIC_POLISHED_TOOLS.has("bank_accounts_summary")).toBe(true);
    expect(core.NOVA_HYBRID_GUARDED_TOOLS.has("bank_accounts_summary")).toBe(false);
    expect(
      core.resolveNovaPresentationMode([
        { tool: "approvals_summary", ok: true, data: { openCount: 2 } },
      ])
    ).toBe("deterministic_polished");
    expect(
      core.resolveNovaPresentationMode([
        { tool: "sales_summary", ok: true, data: { invoiceCount: 1, grandTotalInr: "₹1" } },
      ])
    ).toBe("deterministic_polished");
    expect(
      core.resolveNovaPresentationMode([
        {
          tool: "bank_accounts_summary",
          ok: true,
          data: { accountCount: 1, totalOperationalBalanceInr: "₹1" },
        },
      ])
    ).toBe("deterministic_polished");
  });

  it("sales polished keeps grand total and invoice count", () => {
    const text = formatSalesSummaryPolished({
      period: "July 2026",
      invoiceCount: 42,
      grandTotalInr: "₹12,34,567",
      taxableTotalInr: "₹10,00,000",
      gstTotalInr: "₹2,34,567",
      sampleCount: 2,
      samples: [
        { number: "TI-1", customer: "Acme", amountInr: "₹1,000", date: "2026-07-01" },
        { number: "TI-2", customer: "Beta", amountInr: "₹2,000", date: "2026-07-02" },
      ],
    });
    expect(text).toContain("## Sales summary — July 2026");
    expect(text).toContain("₹12,34,567");
    expect(text).toContain("**42**");
    expect(text).toContain("* TI-1 — Acme");
    expect(text).not.toMatch(/;/);
    expect(text).toMatch(/Showing 2 of 42/);
  });

  it("receipts polished keeps collected total and receipt count", () => {
    const text = formatReceiptsSummaryPolished({
      period: "July 2026",
      receiptCount: 5,
      totalCollectedInr: "₹50,000",
      sampleReceipts: [
        {
          number: "R-1",
          customer: "Acme",
          amountInr: "₹10,000",
          date: "2026-07-03",
          mode: "NEFT",
        },
      ],
    });
    expect(text).toContain("## Collections summary — July 2026");
    expect(text).toContain("₹50,000");
    expect(text).toContain("**5**");
    expect(text).toContain("R-1 — Acme — ₹10,000");
  });

  it("tasks polished uses bullets for samples (no semicolon pack)", () => {
    const text = formatTasksSummaryPolished({
      openCount: 3,
      overdueCount: 1,
      dueSoonCount: 2,
      samples: [
        {
          no: "T-9",
          title: "Site visit",
          status: "OPEN",
          priority: "HIGH",
          due: "2026-07-10",
          overdue: true,
          assigneeNames: ["Ada"],
          project: { name: "Plant A" },
        },
      ],
    });
    expect(text).toContain("## Tasks summary");
    expect(text).toContain("**3** open");
    expect(text).toContain("**1** overdue");
    expect(text).toContain("* T-9");
    expect(text).toContain("OVERDUE");
    expect(text).not.toMatch(/open, .* overdue;/);
  });

  it("approvals queue is deterministic_polished card layout", () => {
    const text = formatApprovalsSummaryPolished({
      openCount: 2,
      samples: [
        { no: "AP-1", title: "Leave", status: "PENDING", approver: "Manager" },
        { no: "AP-2", title: "OT", status: "PENDING", approver: null },
      ],
    });
    expect(text).toContain("## Open approvals");
    expect(text).toContain("**2**");
    expect(text).toContain("### Queue");
    expect(text).toContain("* AP-1 Leave — PENDING → Manager");
  });

  it("bank accounts respects balancesVisible=false", () => {
    const text = formatBankAccountsSummaryPolished({
      accountCount: 3,
      balancesVisible: false,
      note: "Balances hidden for your role.",
      totalOperationalBalanceInr: "₹9,99,999",
    });
    expect(text).toContain("**3** active");
    expect(text).toContain("Balances hidden");
    expect(text).not.toContain("₹9,99,999");
  });

  it("bank accounts polished shows operational + book without LLM", () => {
    const text = formatBankAccountsSummaryPolished({
      accountCount: 2,
      balancesVisible: true,
      totalOperationalBalanceInr: "₹1,84,24,601.00",
      totalBookBalanceInr: "₹1,80,00,000.00",
      totalStatementBalanceInr: "₹1,75,00,000.00",
      accounts: [
        { id: "BA-1", bank: "HDFC", nickname: "Main", bookBalanceInr: "₹1,00,00,000.00" },
      ],
    });
    expect(text).toContain("## Bank accounts");
    expect(text).toContain("₹1,84,24,601.00");
    expect(text).toContain("Book ₹1,80,00,000.00");
    expect(text).toContain("BA-1 Main");
    expect(text).not.toMatch(/inconsistently/i);
  });

  it("customers polished keeps active/total and recent rows (no AR invent)", () => {
    const text = formatCustomersSummaryPolished({
      activeCount: 12,
      totalCount: 15,
      entityFilter: "Avaada",
      recentCustomers: [
        { id: "C-1", name: "Avaada", company: "Avaada Energy", state: "MH", active: true },
      ],
    });
    expect(text).toContain("## Customers — Avaada");
    expect(text).toContain("**12** active / **15** total");
    expect(text).toContain("* Avaada · (C-1)");
    expect(text).not.toMatch(/outstanding|₹/i);
    expect(formatPrepPolishedFact("customers_summary", { activeCount: 1, totalCount: 1 })).toContain(
      "Customers"
    );
  });

  it("dispatcher returns null for unknown tools and stitches known facts", () => {
    expect(formatPrepPolishedFact("attendance_late_summary", {})).toBeNull();
    const multi = formatPrepPolishedFacts([
      {
        tool: "sales_summary",
        ok: true,
        data: { period: "FY", invoiceCount: 1, grandTotalInr: "₹100" },
      },
      {
        tool: "approvals_summary",
        ok: true,
        data: { openCount: 0 },
      },
      { tool: "attendance_late_summary", ok: true, data: { focus: "late" } },
    ]);
    expect(multi).toContain("Sales summary");
    expect(multi).toContain("Open approvals");
    expect(multi).not.toContain("Attendance");
  });
});
