/**
 * Presentation mode + polished/hybrid wiring smoke tests.
 */

import { describe, expect, it } from "vitest";
import {
  formatNovaScopeLabel,
  presentationModeToolTag,
  resolveNovaPresentationMode,
} from "@/lib/ai/nova-presentation";
import { formatFactsPolished } from "@/lib/ai/nova-format";
import { guardNovaAnswer } from "@/lib/ai/nova-answer-guard";

describe("nova presentation modes", () => {
  it("queues resolve to deterministic_polished", () => {
    expect(
      resolveNovaPresentationMode([
        { tool: "payment_requests_summary", ok: true, data: { awaitingActionCount: 3 } },
      ])
    ).toBe("deterministic_polished");
    expect(
      resolveNovaPresentationMode([
        { tool: "approvals_summary", ok: true, data: { openCount: 1 } },
      ])
    ).toBe("deterministic_polished");
  });

  it("attendance overview/late stay hybrid; punch_out + single-day late clocks are deterministic", () => {
    expect(
      resolveNovaPresentationMode([
        {
          tool: "attendance_late_summary",
          ok: true,
          data: { focus: "overview", presentPunchDays: 4, absentDays: 1 },
        },
      ])
    ).toBe("hybrid_guarded");
    expect(
      resolveNovaPresentationMode([
        {
          tool: "attendance_late_summary",
          ok: true,
          data: { focus: "late", latePeopleCount: 2 },
        },
      ])
    ).toBe("hybrid_guarded");
    expect(
      resolveNovaPresentationMode([
        {
          tool: "attendance_late_summary",
          ok: true,
          data: {
            focus: "late",
            periodGrain: "day",
            latePeopleCount: 1,
            topLateComers: [
              { name: "MD Arif Ansari", punchInLabel: "10:06 am", totalLateMinutes: 7 },
            ],
          },
        },
      ])
    ).toBe("deterministic_polished");
    expect(
      resolveNovaPresentationMode([
        {
          tool: "attendance_late_summary",
          ok: true,
          data: { focus: "present", presentPunchDays: 7 },
        },
      ])
    ).toBe("hybrid_guarded");
    expect(
      resolveNovaPresentationMode([
        {
          tool: "attendance_late_summary",
          ok: true,
          data: {
            focus: "punch_out",
            presentPunchDays: 7,
            topPresent: [{ name: "Aalok", punchOutLabel: null }],
          },
        },
      ])
    ).toBe("deterministic_polished");
  });

  it("attendance overview stays hybrid; sales health is deterministic_polished", () => {
    expect(
      resolveNovaPresentationMode([
        {
          tool: "attendance_late_summary",
          ok: true,
          data: { focus: "overview", presentPunchDays: 4, absentDays: 1 },
        },
      ])
    ).toBe("hybrid_guarded");
    expect(
      resolveNovaPresentationMode([
        {
          tool: "sales_summary",
          ok: true,
          data: { invoiceCount: 2, grandTotalInr: "₹100.00" },
        },
      ])
    ).toBe("deterministic_polished");
  });

  it("bank accounts resolve to deterministic_polished (not hybrid)", () => {
    expect(
      resolveNovaPresentationMode([
        {
          tool: "bank_accounts_summary",
          ok: true,
          data: {
            accountCount: 2,
            balancesVisible: true,
            totalOperationalBalanceInr: "₹1,84,24,601.00",
            totalBookBalanceInr: "₹1,80,00,000.00",
          },
        },
      ])
    ).toBe("deterministic_polished");
    expect(
      resolveNovaPresentationMode([
        {
          tool: "bank_recon_summary",
          ok: true,
          data: { unreconciledTotal: 3 },
        },
      ])
    ).toBe("deterministic_polished");
  });

  it("bank money guard passes when LLM leads with operational only", () => {
    const facts = [
      {
        tool: "bank_accounts_summary",
        ok: true,
        data: {
          accountCount: 3,
          balancesVisible: true,
          totalOperationalBalanceInr: "₹1,84,24,601.00",
          totalBookBalanceInr: "₹1,80,00,000.00",
          totalStatementBalanceInr: "₹1,75,00,000.00",
        },
      },
    ];
    const text =
      "Total operational bank balance is **₹1,84,24,601.00** across 3 accounts.";
    const guarded = guardNovaAnswer({
      query: "bank balance",
      facts,
      text,
      deterministic: false,
    });
    expect(guarded.failed).toBe(false);
    expect(guarded.text).not.toMatch(/inconsistently/i);
    expect(guarded.text).toBe(text);
  });

  it("bank polished path has no inconsistency banner", () => {
    const facts = [
      {
        tool: "bank_accounts_summary",
        ok: true,
        data: {
          accountCount: 2,
          balancesVisible: true,
          totalOperationalBalanceInr: "₹50,000.00",
          totalBookBalanceInr: "₹48,000.00",
          totalStatementBalanceInr: "₹47,000.00",
          accounts: [
            { id: "BA-1", bank: "HDFC", nickname: "Ops", bookBalanceInr: "₹30,000.00" },
            { id: "BA-2", bank: "SBI", nickname: null, bookBalanceInr: "₹18,000.00" },
          ],
        },
      },
    ];
    const text = formatFactsPolished("bank accounts", facts);
    expect(text).toMatch(/₹50,000\.00/);
    const guarded = guardNovaAnswer({
      query: "bank accounts",
      facts,
      text: text!,
      deterministic: true,
    });
    expect(guarded.failed).toBe(false);
    expect(guarded.text).not.toMatch(/inconsistently/i);
    expect(guarded.text).not.toMatch(/AI restated/i);
  });

  it("humanizes all_staff and formats attendance as bullets", () => {
    expect(formatNovaScopeLabel("all_staff")).toBe("All staff");
    const text = formatFactsPolished("attendance this week", [
      {
        tool: "attendance_late_summary",
        ok: true,
        data: {
          period: "This week",
          periodGrain: "week",
          scope: "all_staff",
          focus: "overview",
          presentPunchDays: 12,
          absentDays: 3,
          peopleWithLate: 1,
          lateDayCount: 2,
          topPresent: [{ name: "Deepa", presentDays: 5 }],
        },
      },
    ]);
    expect(text).toMatch(/All staff/);
    expect(text).not.toMatch(/all_staff/);
    expect(text).toMatch(/\*\*12\*\* recorded employee present-days/);
    expect(text).toMatch(/\*\*3\*\* recorded absence entries/);
    expect(text).toMatch(/^- /m);
    expect(text).not.toMatch(/;/);
  });

  it("answer guard falls back to polished (not raw semicolon dumps)", () => {
    const facts = [
      {
        tool: "sales_summary",
        ok: true,
        data: {
          period: "July 2026",
          invoiceCount: 2,
          grandTotalInr: "₹1,000.00",
          taxableTotalInr: "₹900.00",
          gstTotalInr: "₹100.00",
        },
      },
    ];
    const guarded = guardNovaAnswer({
      query: "july sales",
      facts,
      text: "Sales were ₹10,000.00 this month.", // wrong total → money guard
      deterministic: false,
    });
    expect(guarded.failed).toBe(true);
    expect(guarded.text).toMatch(/## Sales summary/);
    expect(guarded.text).toMatch(/₹1,000\.00/);
    expect(guarded.text).toMatch(/\*\*2\*\*/);
    expect(guarded.toolsUsed).toContain("deterministic");
  });

  it("formats confirmed projects in period with value / received / outstanding", () => {
    const text = formatFactsPolished("new orders this month", [
      {
        tool: "projects_summary",
        ok: true,
        data: {
          mode: "confirmed_in_period",
          period: "Jul 2026",
          confirmedCount: 1,
          valueVisible: true,
          totalProjectValueInr: "₹10,00,000.00",
          totalReceivedInr: "₹2,50,000.00",
          totalOutstandingInr: "₹7,50,000.00",
          scopeNote: "Projects whose CONFIRMED status date falls in this period.",
          samples: [
            {
              id: "C0001-P001",
              name: "James School",
              customer: "Acme",
              confirmedAt: "2026-07-05",
              valueInr: "₹10,00,000.00",
              receivedInr: "₹2,50,000.00",
              outstandingInr: "₹7,50,000.00",
            },
          ],
        },
      },
    ]);
    expect(text).toMatch(/Projects confirmed/);
    expect(text).toMatch(/Value:.*Received:.*Outstanding:/);
    expect(text).toMatch(/James School/);
    expect(text).toMatch(/confirmed 2026-07-05/);
  });

  it("formats project loss with all-time active and closed P&L scope", () => {
    const text = formatFactsPolished("any project on loss", [
      {
        tool: "profitability_summary",
        ok: true,
        data: {
          projectPlFocus: "loss_making_projects",
          projectPlScope: "all projects, all time",
          projectPlTotal: 2,
          lossMakingProjectCount: 1,
          projectPlSot:
            "Project P&L report SoT: net invoiced revenue minus approved purchase bills and paid non-bill project payment requests.",
          projectPlGapNote:
            "Project-level incentives/manual cost adjustments are available on individual project profitability screens.",
          focusedProjectPlRows: [
            {
              project: "James School",
              projectId: "P-1",
              status: "CLOSED",
              marginInr: "₹-5,000.00",
              outstandingInr: "₹0.00",
              invoicedInr: "₹1,00,000.00",
              purchasesInr: "₹1,05,000.00",
            },
          ],
        },
      },
    ]);
    expect(text).toMatch(/all projects, all time/);
    expect(text).toMatch(/active \+ closed included/);
    expect(text).toMatch(/Loss-making projects:\*\* 1/);
    expect(text).toMatch(/SoT: Project P&L report SoT/);
    expect(text).toMatch(/James School/);
  });

  it("presentationModeToolTag encodes mode", () => {
    expect(presentationModeToolTag("hybrid_guarded")).toBe("presentation:hybrid_guarded");
  });
});
