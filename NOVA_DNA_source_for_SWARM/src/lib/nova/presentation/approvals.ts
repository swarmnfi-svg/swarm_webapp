/**
 * PREP — Polished approvals / pending / payment-request queues (deterministic_polished).
 * Card + bullet lists; no LLM needed for count queues.
 */

import {
  polishBullet,
  polishCount,
  polishJoin,
  polishSection,
  polishTitle,
} from "@/lib/nova/presentation/layout";

export type ApprovalsSummaryFact = {
  openCount?: unknown;
  samples?: Array<{
    no?: string;
    title?: string;
    status?: string;
    approver?: string | null;
  }>;
};

export function formatApprovalsSummaryPolished(d: ApprovalsSummaryFact): string {
  const open = polishCount(d.openCount);
  const lines: string[] = [
    polishTitle("Open approvals"),
    "",
    open === 0
      ? "No open approvals right now."
      : `**${open}** item(s) awaiting action.`,
  ];

  const samples = d.samples ?? [];
  if (samples.length) {
    lines.push("", polishSection("Queue"));
    for (const a of samples.slice(0, 8)) {
      lines.push(
        polishBullet(
          `${a.no ?? "—"} ${a.title ?? ""} — ${a.status ?? "—"}${
            a.approver ? ` → ${a.approver}` : ""
          }`
        )
      );
    }
  }

  return polishJoin(lines);
}

export type PendingWorkflowCountsFact = {
  paymentRequestsAwaiting?: unknown;
  purchaseBillsPending?: unknown;
  openApprovals?: unknown;
};

export function formatPendingWorkflowPolished(d: PendingWorkflowCountsFact): string {
  const lines: string[] = [polishTitle("Pending workflow"), "", "Items waiting on action:"];

  let any = false;
  if (d.paymentRequestsAwaiting !== "denied" && d.paymentRequestsAwaiting != null) {
    lines.push(
      polishBullet(`Payment requests: **${polishCount(d.paymentRequestsAwaiting)}**`)
    );
    any = true;
  }
  if (d.purchaseBillsPending !== "denied" && d.purchaseBillsPending != null) {
    lines.push(
      polishBullet(`Purchase bills pending: **${polishCount(d.purchaseBillsPending)}**`)
    );
    any = true;
  }
  if (d.openApprovals != null) {
    lines.push(polishBullet(`Open approvals: **${polishCount(d.openApprovals)}**`));
    any = true;
  }

  if (!any) {
    return polishJoin([polishTitle("Pending workflow"), "", "No pending workflow counts available."]);
  }

  return polishJoin(lines);
}

export type PaymentRequestsSummaryFact = {
  awaitingActionCount?: unknown;
  paidInPeriod?: unknown;
  awaitingTotalInr?: unknown;
  message?: unknown;
  subject?: { name?: string; relation?: string; staffCode?: string | null } | null;
  listIntent?: unknown;
  samples?: Array<{
    id?: string;
    status?: string;
    amountInr?: string;
    purpose?: string | null;
    party?: string;
  }>;
};

export function formatPaymentRequestsSummaryPolished(d: PaymentRequestsSummaryFact): string {
  if (typeof d.message === "string" && d.message.trim()) {
    return polishJoin([polishTitle("Payment requests"), "", d.message.trim()]);
  }

  const awaiting = polishCount(d.awaitingActionCount);
  const who =
    d.subject && typeof d.subject.name === "string" && d.subject.name.trim()
      ? d.subject.name.trim()
      : null;
  const title = who ? `Payment requests — ${who}` : "Payment requests";
  const lines: string[] = [
    polishTitle(title),
    "",
    who
      ? `${who} has **${awaiting}** pending payment request(s).`
      : polishBullet(`Awaiting action: **${awaiting}**`),
  ];
  if (d.awaitingTotalInr != null && String(d.awaitingTotalInr).trim()) {
    lines.push(polishBullet(`Awaiting total: **${String(d.awaitingTotalInr)}**`));
  }
  if (d.paidInPeriod != null) {
    lines.push(polishBullet(`Paid in period: **${polishCount(d.paidInPeriod)}**`));
  }

  const samples = d.samples ?? [];
  const showList = Boolean(d.listIntent) || samples.length > 0;
  if (showList && samples.length) {
    lines.push("", polishSection(who ? "Pending requests" : "Queue"));
    for (const s of samples.slice(0, 12)) {
      const purpose = (s.purpose ?? "").trim();
      const party = (s.party ?? "").trim();
      const label = purpose || party || "—";
      lines.push(
        polishBullet(
          `${s.id ?? "—"} · ${label} · ${s.amountInr ?? "—"} · ${s.status ?? "—"}`
        )
      );
    }
    const of = polishCount(d.awaitingActionCount);
    if (of > samples.length) {
      lines.push(`_(Showing ${samples.length} of ${of}.)_`);
    }
  } else if (awaiting === 0) {
    lines.push(who ? `No pending payment requests for ${who}.` : "No payment requests awaiting action.");
  }

  return polishJoin(lines);
}
