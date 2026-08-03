/**
 * Payment Request 360 — cross-module consolidated summary for a single payment
 * request, scoped to what the asking user is permitted to see.
 *
 * RBAC / redaction reuse (no duplicated policy):
 *  - Visibility of the record itself: `paymentRequestListWhereForUser` (STAFF see
 *    only their own unless `paymentrequest.view_all`; privileged roles see all).
 *  - Vendor bank / UPI beneficiary details: `canSeeVendorBankDetails` (same gate
 *    as the vendor page / SoD bank write path). Unauthorised users get a masked
 *    note — never the raw UPI / account number.
 *  - Payment posting narration: `canViewPaymentPostingDetails` (privileged roles
 *    + the requesting staff, PAID only).
 *
 * The fact is presented deterministically (never sent to the LLM), and sensitive
 * beneficiary keys are additionally named so the LLM sanitiser redacts them if a
 * future hybrid path ever composes this fact.
 */
import type { SessionUser } from "@/auth";
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { prisma } from "@/lib/nova/prisma-readonly";
import {
  canViewPaymentPostingDetails,
  paymentRequestListWhereForUser,
} from "@/lib/payment-request-access";
import { canSeeVendorBankDetails } from "@/lib/vendor-bank";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";

const TOOL = "entity_360";
const DAY_MS = 86_400_000;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  CLARIFICATION_REQUIRED: "Clarification required",
  SUBMITTED: "Submitted — awaiting manager verification",
  MANAGER_VERIFIED: "Manager verified — awaiting admin approval",
  ADMIN_APPROVED: "Admin approved — ready to pay",
  PAID: "Paid",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  REVERSED: "Reversed",
};

function ageDaysFrom(date: Date): number {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / DAY_MS));
}

function sinceLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function nextActions(pr: {
  status: string;
  paymentStatus: string;
  reconciliationStatus: string;
  updatedAt: Date;
  createdAt: Date;
}): string[] {
  const inState = ageDaysFrom(pr.updatedAt);
  const actions: string[] = [];
  switch (pr.status) {
    case "DRAFT":
      actions.push("Draft — submit the request to start the approval chain.");
      break;
    case "CLARIFICATION_REQUIRED":
      actions.push("Clarification requested — the requester must update and resubmit.");
      break;
    case "SUBMITTED":
      actions.push(`Pending manager verification for ${sinceLabel(inState)}.`);
      break;
    case "MANAGER_VERIFIED":
      actions.push(`Manager verified — pending admin approval for ${sinceLabel(inState)}.`);
      break;
    case "ADMIN_APPROVED":
      actions.push(`Approved for ${sinceLabel(inState)} — ready to mark paid.`);
      break;
    case "PAID":
      if (pr.reconciliationStatus !== "MATCHED") {
        actions.push("Paid but not yet reconciled — match it against the bank statement.");
      } else {
        actions.push("Paid and reconciled — no action needed.");
      }
      break;
    case "REJECTED":
      actions.push("Rejected — no further action unless re-raised.");
      break;
    case "CANCELLED":
      actions.push("Cancelled — no further action.");
      break;
    case "REVERSED":
      actions.push("Payment reversed — review the reversal reason.");
      break;
    default:
      break;
  }
  return actions;
}

async function resolveUserNames(
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      name: true,
      staffProfile: { select: { fullName: true, staffCode: true } },
    },
  });
  const map = new Map<string, string>();
  for (const u of users) {
    const label = u.staffProfile?.fullName || u.name || u.id;
    const code = u.staffProfile?.staffCode ? ` (${u.staffProfile.staffCode})` : "";
    map.set(u.id, `${label}${code}`);
  }
  return map;
}

/** Build the payment-request 360 fact for `identifier`, scoped to `user`. */
export async function buildPaymentRequest360Fact(
  user: SessionUser,
  identifier: string
): Promise<NovaSkillHandlerResult> {
  if (!can(user, "paymentrequest.read") && !can(user, "paymentrequest.create")) {
    return {
      fact: { tool: TOOL, ok: false, denied: true, error: "Missing paymentrequest.read" },
    };
  }

  const scope = await paymentRequestListWhereForUser(user);
  const pr = await prisma.paymentRequest.findFirst({
    where: {
      AND: [scope, { paymentRequestId: { equals: identifier, mode: "insensitive" } }],
    },
    include: {
      vendor: { select: { id: true, vendorId: true, vendorName: true } },
      staff: { select: { id: true, staffCode: true, fullName: true } },
      project: { select: { id: true, projectId: true, projectName: true } },
      purchaseBill: {
        select: { id: true, purchaseBillId: true, vendorInvoiceNumber: true },
      },
      approvals: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10 },
    },
  });

  if (!pr) {
    // Do not disclose whether the id exists beyond the caller's scope.
    return {
      fact: {
        tool: TOOL,
        ok: true,
        data: {
          kind: "payment_request",
          notFound: true,
          identifier,
          message: `No payment request **${identifier}** is visible to you. Check the ID, or you may not have access to it.`,
        },
      },
      links: [{ title: "Payment requests", href: "/payment-requests" }],
    };
  }

  const nameMap = await resolveUserNames([pr.requestedBy, pr.requestedForUserId, pr.paidBy]);
  const createdByName = pr.requestedBy ? nameMap.get(pr.requestedBy) ?? null : null;
  const createdForName =
    pr.requestedForUserId && pr.requestedForUserId !== pr.requestedBy
      ? nameMap.get(pr.requestedForUserId) ?? null
      : null;
  const paidByName = pr.paidBy ? nameMap.get(pr.paidBy) ?? null : null;

  // Which company bank paid this request is payment-posting detail — same gate as
  // the narration below. Only load + surface it for authorised viewers.
  const showPosting = canViewPaymentPostingDetails(user, pr);
  const paidFromBank =
    showPosting && pr.bankAccountId
      ? await prisma.bankAccount.findUnique({
          where: { id: pr.bankAccountId },
          select: { bankAccountId: true, bankName: true, accountNickname: true },
        })
      : null;
  const paidFromBankLabel = paidFromBank
    ? `${paidFromBank.accountNickname || paidFromBank.bankName} (${paidFromBank.bankAccountId})`
    : null;

  // Vendor beneficiary details — only load + surface when authorised.
  const bankDetailsVisible = canSeeVendorBankDetails(user);
  let vendorPaymentDetails: Record<string, unknown> | null = null;
  if (pr.vendor) {
    if (bankDetailsVisible) {
      const vb = await prisma.vendor.findUnique({
        where: { id: pr.vendor.id },
        select: {
          bankAccountName: true,
          bankAccountNumber: true,
          ifsc: true,
          upiId: true,
        },
      });
      vendorPaymentDetails = {
        visible: true,
        vendorBankAccountName: vb?.bankAccountName ?? null,
        vendorBankAccountNumber: vb?.bankAccountNumber ?? null,
        vendorIfsc: vb?.ifsc ?? null,
        vendorUpiId: vb?.upiId ?? null,
      };
    } else {
      vendorPaymentDetails = {
        visible: false,
        note: "Vendor bank / UPI details are hidden for your role.",
      };
    }
  }

  const party = pr.vendor
    ? {
        type: "vendor",
        code: pr.vendor.vendorId,
        name: pr.vendor.vendorName,
        href: `/vendors/${pr.vendor.id}`,
      }
    : pr.staff
      ? {
          type: "staff",
          code: pr.staff.staffCode,
          name: pr.staff.fullName,
          href: `/staff/${pr.staff.id}`,
        }
      : pr.partyLabel
        ? { type: "other", name: pr.partyLabel }
        : null;

  // Defensive against legacy/partial rows: schema types amount as non-null, but
  // never crash the 360 on a missing / non-numeric amount.
  const rawAmount: unknown = pr.amount;
  const parsedAmount = rawAmount == null ? NaN : Number(rawAmount as number);
  const amountValue = Number.isFinite(parsedAmount) ? parsedAmount : null;

  const data: Record<string, unknown> = {
    kind: "payment_request",
    identifier: pr.paymentRequestId,
    href: `/payment-requests/${pr.id}`,
    status: pr.status,
    statusLabel: STATUS_LABEL[pr.status] ?? pr.status,
    requestType: pr.requestType,
    partyType: pr.partyType,
    amount: amountValue,
    amountInr: amountValue !== null ? inr(amountValue) : null,
    purpose: pr.purpose ?? null,
    category: pr.expenseCategory ?? null,
    urgency: pr.urgency ?? null,
    gstApplicable: pr.gstApplicable,
    tdsApplicable: pr.tdsApplicable,
    requestedAt: pr.createdAt.toISOString(),
    paidAt: pr.paidAt ? pr.paidAt.toISOString() : null,
    ageDays: ageDaysFrom(pr.updatedAt),
    createdByName,
    createdForName,
    paidByName,
    party,
    project: pr.project
      ? {
          id: pr.project.projectId,
          name: pr.project.projectName,
          href: `/projects/${pr.project.id}`,
        }
      : pr.projectRef
        ? { id: pr.projectRef, name: null, href: null }
        : null,
    purchaseBill: pr.purchaseBill
      ? {
          code: pr.purchaseBill.purchaseBillId,
          invoiceNumber: pr.purchaseBill.vendorInvoiceNumber,
          href: `/purchase-bills/${pr.purchaseBill.id}`,
        }
      : null,
    approvals: {
      manager: pr.managerApprovalStatus,
      admin: pr.adminApprovalStatus,
      payment: pr.paymentStatus,
      reconciliation: pr.reconciliationStatus,
      adminOverride: pr.adminOverride,
    },
    approvalHistory: pr.approvals.slice(0, 8).map((a) => ({
      action: a.action,
      at: a.createdAt.toISOString(),
      note: a.note ?? null,
    })),
    paidFromBankLabel,
    bankDetailsVisible,
    vendorPaymentDetails,
    paymentNarration: showPosting ? pr.paymentNarration ?? null : null,
    nextActions: nextActions(pr),
  };

  const links = [{ title: `Payment request ${pr.paymentRequestId}`, href: `/payment-requests/${pr.id}` }];
  if (party?.href) links.push({ title: party.name ?? "Party", href: party.href });

  return {
    fact: {
      tool: TOOL,
      ok: true,
      data: withFactProvenance(data, {
        period: null,
        sources: ["payment_request", "vendor", "project", "bank"],
      }),
    },
    links,
  };
}
