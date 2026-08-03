/**
 * NOVA safe workflow open — answer path (P1: payment, purchase, tasks, staff types).
 * Read-only: resolve entities, RBAC check, return navigate link. Never create/submit.
 */

import type { SessionUser } from "@/auth";
import { canAccessPath } from "@/lib/route-access";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { vendorListWhere } from "@/lib/vendor-visibility";
import {
  buildEntityClarifyCard,
  buildPersonClarifyCard,
  formatNovaClarifyCard,
  type NovaClarifyOption,
  type NovaClarifyKind,
} from "@/lib/ai/nova-clarify";
import { isNovaSafeWorkflowOpenEnabled } from "@/lib/nova/safe-workflow/gates";
import {
  matchNovaSafeWorkflowOpen,
  safeWorkflowFormPath,
  type NovaSafeWorkflowFormId,
  type NovaSafeWorkflowMatch,
} from "@/lib/nova/safe-workflow/map";
import {
  buildNovaWorkflowPrefillUrl,
  formatNovaWorkflowAmountInr,
} from "@/lib/nova/safe-workflow/url";
import { isHrRegularisationType } from "@/lib/hr/create-regularisation";
import { listTasksForUser } from "@/lib/tasks/queries";
import { canEditTaskAsync } from "@/lib/tasks/access";

export type NovaSafeWorkflowAnswer = {
  answer: string;
  links: { title: string; href: string }[];
  toolsUsed: string[];
  interpretedAs?: string[];
  options?: NovaClarifyOption[];
  clarifyKind?: NovaClarifyKind;
};

const VENDOR_PAYMENT_PERM = "paymentrequest.type.vendor_payment";

const FORM_LABELS: Record<NovaSafeWorkflowFormId, string> = {
  payment_request_new: "New Payment Request",
  staff_advance: "New Staff Advance",
  staff_reimbursement: "New Staff Reimbursement",
  purchase_request_new: "New Purchase Request",
  task_new: "New Task",
  task_edit: "Edit Task",
  leave_new: "Leave request",
  regularisation_new: "Regularisation request",
};

const FORM_TOOLS: Record<NovaSafeWorkflowFormId, string> = {
  payment_request_new: "form:payment_request_new",
  staff_advance: "form:staff_advance",
  staff_reimbursement: "form:staff_reimbursement",
  purchase_request_new: "form:purchase_request_new",
  task_new: "form:task_new",
  task_edit: "form:task_edit",
  leave_new: "form:leave_new",
  regularisation_new: "form:regularisation_new",
};

function canOpenForm(user: SessionUser, formId: NovaSafeWorkflowFormId): boolean {
  try {
    return canAccessPath(user, safeWorkflowFormPath(formId));
  } catch {
    return false;
  }
}

function canUseVendorPaymentType(user: SessionUser): boolean {
  if (user.role !== "STAFF") return true;
  const grants = user.grantedPermissions ?? [];
  return grants.includes(VENDOR_PAYMENT_PERM);
}

function permissionRefuse(
  match: NovaSafeWorkflowMatch,
  note?: string
): NovaSafeWorkflowAnswer {
  const label = FORM_LABELS[match.formId];
  const tool = FORM_TOOLS[match.formId];
  const lines = [
    `**Opened form — review and submit yourself** does not apply here — you don’t have permission to open **${label}**.`,
    "",
    note ?? "Ask an Admin to grant the required create permission.",
    "",
    "I did **not** create or submit anything.",
  ];
  return {
    answer: lines.join("\n"),
    links: [
      { title: "User Manual", href: "/user-manual" },
      { title: "Help examples", href: "/ai-assistant" },
    ],
    toolsUsed: ["workflow_open", "permission_help", "rbac", tool],
    interpretedAs: ["workflow_open", "permission_help"],
  };
}

function openAnswer(opts: {
  formId: NovaSafeWorkflowFormId;
  href: string;
  summary: string;
  linkTitle?: string;
  note?: string;
}): NovaSafeWorkflowAnswer {
  const lines = [
    `**Opened form — review and submit yourself**`,
    "",
    opts.summary,
    "Review the form and submit it yourself — I did **not** create or submit anything.",
  ];
  if (opts.note) lines.push("", opts.note);
  return {
    answer: lines.join("\n"),
    links: [
      {
        title: opts.linkTitle ?? `Open ${FORM_LABELS[opts.formId].toLowerCase()}`,
        href: opts.href,
      },
    ],
    toolsUsed: ["workflow_open", FORM_TOOLS[opts.formId]],
    interpretedAs: ["workflow_open", opts.formId],
  };
}

async function resolveVendors(user: SessionUser, hint: string) {
  const q = hint.trim().slice(0, 80);
  if (!q) return [];
  return prisma.vendor.findMany({
    where: vendorListWhere(user, {
      active: true,
      OR: [
        { vendorName: { contains: q, mode: "insensitive" } },
        { vendorId: { contains: q, mode: "insensitive" } },
      ],
    }),
    orderBy: { seq: "asc" },
    take: 8,
    select: { id: true, vendorId: true, vendorName: true },
  });
}

async function resolveProjects(hint: string) {
  const q = hint.trim().slice(0, 80);
  if (!q) return [];
  return prisma.project.findMany({
    where: {
      OR: [
        { projectId: { contains: q, mode: "insensitive" } },
        { projectName: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { projectId: "asc" },
    take: 8,
    select: { id: true, projectId: true, projectName: true },
  });
}

async function resolveAssignees(hint: string) {
  const q = hint.trim().slice(0, 80);
  if (!q) return [];
  const staffMatches = await prisma.staffProfile.findMany({
    where: {
      employmentStatus: "ACTIVE",
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { staffCode: { equals: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, fullName: true, staffCode: true, userId: true },
    take: 8,
  });
  if (staffMatches.length > 0) {
    return staffMatches
      .filter((s) => s.userId)
      .map((s) => ({
        userId: s.userId!,
        label: s.fullName,
        code: s.staffCode,
      }));
  }
  const users = await prisma.user.findMany({
    where: {
      active: true,
      OR: [{ name: { contains: q, mode: "insensitive" } }],
    },
    select: {
      id: true,
      name: true,
      staffProfile: { select: { fullName: true, staffCode: true } },
    },
    take: 8,
  });
  return users.map((u) => ({
    userId: u.id,
    label: u.staffProfile?.fullName ?? u.name ?? u.id,
    code: u.staffProfile?.staffCode ?? null,
  }));
}

async function answerPaymentRequest(
  user: SessionUser,
  match: Extract<NovaSafeWorkflowMatch, { formId: "payment_request_new" }>
): Promise<NovaSafeWorkflowAnswer> {
  if (!canOpenForm(user, "payment_request_new") || !canUseVendorPaymentType(user)) {
    return permissionRefuse(
      match,
      "Ask an Admin to grant `paymentrequest.create` (and for Staff, `paymentrequest.type.vendor_payment` if needed)."
    );
  }

  const vendors = await resolveVendors(user, match.vendorHint);
  const amountLabel = formatNovaWorkflowAmountInr(match.amount);

  if (vendors.length === 0) {
    return openAnswer({
      formId: "payment_request_new",
      href: buildNovaWorkflowPrefillUrl({
        formId: "payment_request_new",
        type: match.type,
        amount: match.amount,
        purpose: match.purpose,
      }),
      summary: `Opened **New Payment Request** with amount **${amountLabel}** suggested for vendor **${match.vendorHint}**.`,
      note: `I couldn’t uniquely match a vendor named “${match.vendorHint}” in your list — pick the vendor yourself.`,
    });
  }

  if (vendors.length > 1) {
    const card = buildEntityClarifyCard(
      match.vendorHint,
      vendors.map((v) => ({
        id: v.id,
        label: v.vendorName,
        type: "vendor" as const,
        code: v.vendorId,
      }))
    );
    return {
      answer: [
        formatNovaClarifyCard(card),
        "",
        `Once you pick a vendor, I’ll open **New Payment Request** for **${amountLabel}** — you still review and submit yourself.`,
      ].join("\n"),
      links: [{ title: "Payment requests", href: "/payment-requests" }],
      toolsUsed: ["workflow_open", "clarify", "form:payment_request_new"],
      interpretedAs: ["workflow_open", "clarify"],
      options: card.options,
      clarifyKind: card.kind,
    };
  }

  const v = vendors[0]!;
  return openAnswer({
    formId: "payment_request_new",
    href: buildNovaWorkflowPrefillUrl({
      formId: "payment_request_new",
      type: match.type,
      vendor: v.id,
      amount: match.amount,
      purpose: match.purpose,
    }),
    summary: `Opened **New Payment Request** with vendor **${v.vendorName}** and amount **${amountLabel}** suggested.`,
    linkTitle: "Open payment request form",
  });
}

async function answerStaffPaymentType(
  user: SessionUser,
  match: Extract<
    NovaSafeWorkflowMatch,
    { formId: "staff_advance" | "staff_reimbursement" }
  >
): Promise<NovaSafeWorkflowAnswer> {
  if (!canOpenForm(user, match.formId)) {
    return permissionRefuse(match);
  }

  const label = FORM_LABELS[match.formId];
  const amountPart =
    match.amount != null ? ` and amount **${formatNovaWorkflowAmountInr(match.amount)}**` : "";
  return openAnswer({
    formId: match.formId,
    href: buildNovaWorkflowPrefillUrl({
      formId: match.formId,
      type: match.type,
      amount: match.amount,
      purpose: match.purpose,
    }),
    summary: `Opened **${label}** with type pre-selected${amountPart} suggested.`,
    linkTitle: `Open ${label.toLowerCase()}`,
  });
}

async function answerPurchaseRequest(
  user: SessionUser,
  match: Extract<NovaSafeWorkflowMatch, { formId: "purchase_request_new" }>
): Promise<NovaSafeWorkflowAnswer> {
  if (!canOpenForm(user, "purchase_request_new")) {
    return permissionRefuse(
      match,
      "Ask an Admin to grant `purchaserequest.create`."
    );
  }

  let vendorId: string | undefined;
  let vendorLabel = match.vendorHint;
  if (match.vendorHint) {
    const vendors = await resolveVendors(user, match.vendorHint);
    if (vendors.length > 1) {
      const card = buildEntityClarifyCard(
        match.vendorHint,
        vendors.map((v) => ({
          id: v.id,
          label: v.vendorName,
          type: "vendor" as const,
          code: v.vendorId,
        }))
      );
      return {
        answer: [
          formatNovaClarifyCard(card),
          "",
          "Once you pick a vendor, I’ll open **New Purchase Request** — you still review and submit yourself.",
        ].join("\n"),
        links: [{ title: "Purchase requests", href: "/purchase-requests" }],
        toolsUsed: ["workflow_open", "clarify", "form:purchase_request_new"],
        interpretedAs: ["workflow_open", "clarify"],
        options: card.options,
        clarifyKind: card.kind,
      };
    }
    if (vendors.length === 1) {
      vendorId = vendors[0]!.id;
      vendorLabel = vendors[0]!.vendorName;
    }
  }

  let projectRef: string | undefined;
  if (match.projectHint) {
    const projects = await resolveProjects(match.projectHint);
    if (projects.length === 1) projectRef = projects[0]!.projectId;
  }

  const parts: string[] = ["Opened **New Purchase Request**"];
  if (match.itemHint) parts.push(`with item **${match.itemHint}**`);
  if (vendorLabel) parts.push(`vendor **${vendorLabel}**`);
  if (match.amount != null) {
    parts.push(`estimated price **${formatNovaWorkflowAmountInr(match.amount)}**`);
  }

  return openAnswer({
    formId: "purchase_request_new",
    href: buildNovaWorkflowPrefillUrl({
      formId: "purchase_request_new",
      vendor: vendorId,
      item: match.itemHint,
      project: projectRef,
      amount: match.amount,
      purpose: match.purpose,
    }),
    summary: `${parts.join(" ")} suggested.`,
    linkTitle: "Open purchase request form",
    note:
      match.vendorHint && !vendorId
        ? `I couldn’t uniquely match vendor “${match.vendorHint}” — pick or type the vendor yourself.`
        : undefined,
  });
}

async function answerTaskNew(
  user: SessionUser,
  match: Extract<NovaSafeWorkflowMatch, { formId: "task_new" }>
): Promise<NovaSafeWorkflowAnswer> {
  if (!canOpenForm(user, "task_new")) {
    return permissionRefuse(match);
  }

  let assigneeId: string | undefined;
  let assigneeLabel = match.assigneeHint;
  if (match.assigneeHint) {
    const people = await resolveAssignees(match.assigneeHint);
    if (people.length > 1) {
      const card = buildPersonClarifyCard(
        match.assigneeHint,
        people.map((p) => ({
          id: p.userId,
          label: p.label,
          type: "staff" as const,
          code: p.code,
        }))
      );
      return {
        answer: [
          formatNovaClarifyCard(card),
          "",
          `Once you pick a person, I’ll open **New Task** titled **${match.title}** — you still review and submit yourself.`,
        ].join("\n"),
        links: [{ title: "Tasks", href: "/tasks" }],
        toolsUsed: ["workflow_open", "clarify", "form:task_new"],
        interpretedAs: ["workflow_open", "clarify"],
        options: card.options,
        clarifyKind: card.kind,
      };
    }
    if (people.length === 1) {
      assigneeId = people[0]!.userId;
      assigneeLabel = people[0]!.label;
    }
  }

  let projectId: string | undefined;
  if (match.projectHint) {
    const projects = await resolveProjects(match.projectHint);
    if (projects.length === 1) projectId = projects[0]!.id;
  }

  const parts = [`Opened **New Task** with title **${match.title}**`];
  if (assigneeLabel) parts.push(`assignee **${assigneeLabel}**`);

  return openAnswer({
    formId: "task_new",
    href: buildNovaWorkflowPrefillUrl({
      formId: "task_new",
      title: match.title,
      assignee: assigneeId,
      projectId,
    }),
    summary: `${parts.join(" and ")} suggested.`,
    linkTitle: "Open new task form",
    note:
      match.assigneeHint && !assigneeId
        ? `I couldn’t uniquely match assignee “${match.assigneeHint}” — pick the assignee yourself.`
        : undefined,
  });
}

async function answerTaskEdit(
  user: SessionUser,
  match: Extract<NovaSafeWorkflowMatch, { formId: "task_edit" }>
): Promise<NovaSafeWorkflowAnswer> {
  if (!canOpenForm(user, "task_edit")) {
    return permissionRefuse(match);
  }

  const hint = match.titleHint.trim();
  const candidates = await listTasksForUser(user, { q: hint, scope: "all" }, 8);
  const exact = candidates.filter(
    (t) => t.title.trim().toLowerCase() === hint.toLowerCase()
  );
  const pool = exact.length > 0 ? exact : candidates;

  if (pool.length === 0) {
    return {
      answer: [
        `I couldn’t find a task titled **${hint}** that you can edit.`,
        "",
        "Open **Tasks**, find the right one, then use **Edit** — I won’t change anything myself.",
      ].join("\n"),
      links: [{ title: "Tasks", href: "/tasks" }],
      toolsUsed: ["workflow_open", "clarify", "form:task_edit"],
      interpretedAs: ["workflow_open", "clarify"],
    };
  }

  if (pool.length > 1) {
    const card = buildEntityClarifyCard(
      hint,
      pool.slice(0, 6).map((t) => ({
        id: t.id,
        label: t.title,
        type: "other" as const,
        code: t.project?.projectId ?? undefined,
      }))
    );
    return {
      answer: [
        formatNovaClarifyCard(card),
        "",
        `Several tasks match **${hint}**. Pick one and I’ll open its **edit** form — you still review and save yourself.`,
      ].join("\n"),
      links: [{ title: "Tasks", href: "/tasks" }],
      toolsUsed: ["workflow_open", "clarify", "form:task_edit"],
      interpretedAs: ["workflow_open", "clarify"],
      options: card.options,
      clarifyKind: card.kind,
    };
  }

  const task = pool[0]!;
  if (!(await canEditTaskAsync(user, task))) {
    return permissionRefuse(
      match,
      "You can view that task, but you don’t have permission to edit it."
    );
  }

  return openAnswer({
    formId: "task_edit",
    href: `/tasks/${task.id}?edit=1`,
    summary: `Opened **Edit Task** for **${task.title}**.`,
    linkTitle: "Open task edit form",
    note: "Fields are prefilled from the task — review and save yourself. I did **not** submit changes.",
  });
}

async function resolveLeaveTypes(hint: string) {
  const q = hint.trim().slice(0, 60);
  if (!q) return [];
  return prisma.hrLeaveType.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { name: { equals: q, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 8,
    select: { id: true, name: true, attendanceEffect: true },
  });
}

async function answerLeaveNew(
  user: SessionUser,
  match: Extract<NovaSafeWorkflowMatch, { formId: "leave_new" }>
): Promise<NovaSafeWorkflowAnswer> {
  if (!can(user, "hr.leave.create") || !canOpenForm(user, "leave_new")) {
    return permissionRefuse(
      match,
      "Ask an Admin to grant `hr.leave.create`."
    );
  }

  let leaveTypeId: string | undefined;
  let leaveTypeLabel = match.leaveTypeHint;
  if (match.leaveTypeHint) {
    const types = await resolveLeaveTypes(match.leaveTypeHint);
    if (types.length > 1) {
      const card = buildEntityClarifyCard(
        match.leaveTypeHint,
        types.map((t) => ({
          id: t.id,
          label: t.name,
          type: "other" as const,
          code: t.attendanceEffect,
        }))
      );
      return {
        answer: [
          formatNovaClarifyCard(card),
          "",
          "Once you pick a leave type, I’ll open the leave form — you still review and submit yourself.",
        ].join("\n"),
        links: [{ title: "Leave", href: "/attendance-hr/leave" }],
        toolsUsed: ["workflow_open", "clarify", "form:leave_new"],
        interpretedAs: ["workflow_open", "clarify"],
        options: card.options,
        clarifyKind: card.kind,
      };
    }
    if (types.length === 1) {
      leaveTypeId = types[0]!.id;
      leaveTypeLabel = types[0]!.name;
    }
  }

  const parts = ["Opened **Leave request**"];
  if (leaveTypeLabel) parts.push(`type **${leaveTypeLabel}**`);
  if (match.fromDate && match.toDate) {
    parts.push(
      match.fromDate === match.toDate
        ? `date **${match.fromDate}**`
        : `dates **${match.fromDate}** → **${match.toDate}**`
    );
  }
  if (match.halfDayType && match.halfDayType !== "NONE") {
    parts.push(`half-day **${match.halfDayType.replace(/_/g, " ").toLowerCase()}**`);
  }

  return openAnswer({
    formId: "leave_new",
    href: buildNovaWorkflowPrefillUrl({
      formId: "leave_new",
      leaveTypeId,
      fromDate: match.fromDate,
      toDate: match.toDate,
      halfDayType: match.halfDayType,
      reason: match.reason,
    }),
    summary: `${parts.join(" with ")} suggested.`,
    linkTitle: "Open leave form",
    note:
      match.leaveTypeHint && !leaveTypeId
        ? `I couldn’t uniquely match leave type “${match.leaveTypeHint}” — pick the type yourself.`
        : undefined,
  });
}

async function answerRegularisationNew(
  user: SessionUser,
  match: Extract<NovaSafeWorkflowMatch, { formId: "regularisation_new" }>
): Promise<NovaSafeWorkflowAnswer> {
  if (!can(user, "hr.regularisation.create") || !canOpenForm(user, "regularisation_new")) {
    return permissionRefuse(
      match,
      "Ask an Admin to grant `hr.regularisation.create`."
    );
  }

  const requestType =
    match.requestType && isHrRegularisationType(match.requestType)
      ? match.requestType
      : undefined;

  const parts = ["Opened **Regularisation request**"];
  if (requestType) parts.push(`type **${requestType.replace(/_/g, " ")}**`);
  if (match.date) parts.push(`date **${match.date}**`);

  return openAnswer({
    formId: "regularisation_new",
    href: buildNovaWorkflowPrefillUrl({
      formId: "regularisation_new",
      requestType,
      date: match.date,
      reason: match.reason,
    }),
    summary: `${parts.join(" with ")} suggested.`,
    linkTitle: "Open regularisation form",
  });
}

/**
 * If the utterance matches safe workflow open and the flag allows it, return
 * a navigate+prefill answer. Otherwise null (howto / write-deny / tools continue).
 */
export async function tryAnswerNovaSafeWorkflow(
  user: SessionUser,
  query: string
): Promise<NovaSafeWorkflowAnswer | null> {
  if (!isNovaSafeWorkflowOpenEnabled(user)) return null;
  const match = matchNovaSafeWorkflowOpen(query);
  if (!match) return null;

  switch (match.formId) {
    case "payment_request_new":
      return answerPaymentRequest(user, match);
    case "staff_advance":
    case "staff_reimbursement":
      return answerStaffPaymentType(user, match);
    case "purchase_request_new":
      return answerPurchaseRequest(user, match);
    case "task_new":
      return answerTaskNew(user, match);
    case "task_edit":
      return answerTaskEdit(user, match);
    case "leave_new":
      return answerLeaveNew(user, match);
    case "regularisation_new":
      return answerRegularisationNew(user, match);
  }
}
