/**
 * Arif payment requests + sticky “can u list” follow-up.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { buildNovaPlan } from "@/lib/ai/nova-plan";
import { extractNovaPersonHint } from "@/lib/ai/nova-lexicon";
import {
  isPronounOrListFollowUp,
  toolsFromRecentNovaContext,
  resolveNovaFollowUp,
} from "@/lib/ai/nova-context";
import { formatPaymentRequestsSummaryPolished } from "@/lib/nova/presentation/approvals";

describe("NOVA — person payment requests + list follow-up", () => {
  it("fixes paymrnt typo to payment", () => {
    const n = normalizeNovaQuery("Arif paymrnt requests pending");
    expect(n).toMatch(/payment/i);
    expect(n).not.toMatch(/paymrnt/i);
  });

  it("routes typo + person to payment_requests_summary (not search/clarify dump)", () => {
    const n = normalizeNovaQuery("Arif paymrnt requests pending");
    expect(selectNovaTools(n)).toEqual(["payment_requests_summary"]);
    expect(selectNovaTools(n)).not.toContain("staff_advances_summary");
    const plan = buildNovaPlan(n);
    expect(plan.tools).toContain("payment_requests_summary");
    expect(plan.clarify).toBeUndefined();
  });

  it("extracts person hint for Arif payment requests pending", () => {
    expect(extractNovaPersonHint("Arif payment requests pending")).toBe("Arif");
    expect(extractNovaPersonHint(normalizeNovaQuery("Arif paymrnt requests pending"))).toBe(
      "Arif"
    );
  });

  it("does not treat advance-less payment requests as staff advances", () => {
    const q = normalizeNovaQuery("MD Arif Ansari payment requests pending");
    expect(selectNovaTools(q)).toEqual(["payment_requests_summary"]);
    expect(selectNovaTools(q)).not.toContain("staff_advances_summary");
  });

  it("recognizes can u list / list / list them as list follow-ups", () => {
    for (const q of [
      "can u list",
      "can you list",
      "list",
      "list please",
      "list them",
      "can u list them",
      "please list",
    ]) {
      expect(isPronounOrListFollowUp(q), q).toBe(true);
    }
  });

  it("sticky can u list after payment-request answer forces payment_requests_summary", () => {
    const forced = toolsFromRecentNovaContext(
      "Arif payment requests pending",
      "MD Arif Ansari has 3 pending payment requests"
    );
    expect(forced).toEqual(["payment_requests_summary"]);

    const fu = resolveNovaFollowUp("can u list", [
      { role: "user", content: "Arif payment requests pending" },
      {
        role: "assistant",
        content: "MD Arif Ansari has 3 pending payment requests",
      },
    ]);
    expect(fu.isFollowUp).toBe(true);
    expect(fu.forcedTools).toEqual(["payment_requests_summary"]);
    expect(fu.query).toMatch(/list/i);
  });

  it("polished payment requests lists samples with titles/amounts/status", () => {
    const text = formatPaymentRequestsSummaryPolished({
      awaitingActionCount: 3,
      awaitingTotalInr: "₹12,000.00",
      subject: { name: "MD Arif Ansari", relation: "other", staffCode: "E001" },
      listIntent: true,
      samples: [
        {
          id: "PR-1",
          purpose: "Site travel",
          amountInr: "₹4,000.00",
          status: "SUBMITTED",
        },
        {
          id: "PR-2",
          purpose: "Vendor bill",
          amountInr: "₹5,000.00",
          status: "MANAGER_VERIFIED",
        },
        {
          id: "PR-3",
          party: "Steel Co",
          amountInr: "₹3,000.00",
          status: "ADMIN_APPROVED",
        },
      ],
    });
    expect(text).toMatch(/MD Arif Ansari/i);
    expect(text).toMatch(/3/);
    expect(text).toMatch(/PR-1/);
    expect(text).toMatch(/Site travel/);
    expect(text).toMatch(/₹4,000/);
    expect(text).toMatch(/SUBMITTED/);
    expect(text).not.toMatch(/Staff advances/i);
  });
});
