/**
 * NOVA safe workflow open — unit + answer path (P1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSafeWorkflowFillTargetsForTests,
  buildNovaWorkflowPrefillUrl,
  formIdFromSafeWorkflowHrefPath,
  isNovaSafeWorkflowHardWriteCue,
  isNovaSafeWorkflowOpenEnabled,
  isNovaSafeWorkflowOpenQuery,
  isNovaSafeWorkflowPrefillHref,
  isNovaPurchaseRequestCue,
  matchNovaSafeWorkflowOpen,
  parseNovaSafeWorkflowHref,
  parseNovaWorkflowPrefillAmount,
  safeWorkflowFormPath,
  subscribeSafeWorkflowFill,
  trySameTabSafeWorkflowFill,
} from "@/lib/nova/safe-workflow";
import { tryAnswerNovaSafeWorkflow } from "@/lib/nova/safe-workflow/answer";
import { isNovaWriteMutationQuery, preflightNovaWriteDeny } from "@/lib/ai/nova-write-guards";
import { answerNovaQuery } from "@/lib/ai/nova";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vendor: { findMany: vi.fn().mockResolvedValue([]) },
    customer: { findMany: vi.fn().mockResolvedValue([]) },
    project: { findMany: vi.fn().mockResolvedValue([]) },
    staffProfile: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    companyProfile: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Test Co",
        brandName: "TestBrand",
        timezone: "Asia/Kolkata",
      }),
    },
    hrLeaveType: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/ai/llm", () => ({
  isNovaLlmConfigured: () => false,
  novaChatCompletion: vi.fn(),
}));

function adminUser() {
  return {
    id: "u-admin",
    email: "admin@test.com",
    name: "Admin",
    role: "ADMIN",
    grantedPermissions: [
      "ai.assistant.read",
      "paymentrequest.create",
      "paymentrequest.read",
      "purchaserequest.create",
      "vendor.read",
      "task.create.self",
      "task.create.project",
      "task.assign",
    ],
  } as never;
}

function staffUser() {
  return {
    id: "u-staff",
    email: "staff@test.com",
    name: "Staff",
    role: "STAFF",
    grantedPermissions: [
      "ai.assistant.read",
      "paymentrequest.create",
      "paymentrequest.type.vendor_payment",
      "task.create.self",
    ],
  } as never;
}

function staffNoCreate() {
  return {
    id: "u-staff",
    email: "staff@test.com",
    name: "Staff",
    role: "STAFF",
    grantedPermissions: ["ai.assistant.read", "customer.read"],
  } as never;
}

function directorUser() {
  return {
    id: "u-dir",
    email: "dir@test.com",
    name: "Director",
    role: "DIRECTOR",
    grantedPermissions: ["ai.assistant.read", "task.create.self", "task.create.project"],
  } as never;
}

describe("safe workflow gates", () => {
  const prev = process.env.NOVA_SAFE_WORKFLOW_OPEN;

  afterEach(() => {
    if (prev === undefined) delete process.env.NOVA_SAFE_WORKFLOW_OPEN;
    else process.env.NOVA_SAFE_WORKFLOW_OPEN = prev;
  });

  it("default: on for Admin, off for Staff when env unset", () => {
    delete process.env.NOVA_SAFE_WORKFLOW_OPEN;
    expect(isNovaSafeWorkflowOpenEnabled({ role: "ADMIN" })).toBe(true);
    expect(isNovaSafeWorkflowOpenEnabled({ role: "DIRECTOR" })).toBe(true);
    expect(isNovaSafeWorkflowOpenEnabled({ role: "STAFF" })).toBe(false);
  });

  it("env on enables Staff; env off disables Admin", () => {
    process.env.NOVA_SAFE_WORKFLOW_OPEN = "1";
    expect(isNovaSafeWorkflowOpenEnabled({ role: "STAFF" })).toBe(true);
    process.env.NOVA_SAFE_WORKFLOW_OPEN = "false";
    expect(isNovaSafeWorkflowOpenEnabled({ role: "ADMIN" })).toBe(false);
  });
});

describe("safe workflow map", () => {
  it("parses create payment request for vendor + amount", () => {
    const m = matchNovaSafeWorkflowOpen(
      "create a payment request for vendor keshav raj for 4000"
    );
    expect(m).toMatchObject({
      formId: "payment_request_new",
      type: "VENDOR_PAYMENT",
      vendorHint: "keshav raj",
      amount: 4000,
    });
  });

  it("parses purchase request with item + amount", () => {
    const m = matchNovaSafeWorkflowOpen(
      "create a purchase request for item FRP tank for 12000"
    );
    expect(m).toMatchObject({
      formId: "purchase_request_new",
      itemHint: "FRP tank",
      amount: 12000,
    });
  });

  it("parses staff advance without amount", () => {
    const m = matchNovaSafeWorkflowOpen("create staff advance request");
    expect(m).toMatchObject({
      formId: "staff_advance",
      type: "STAFF_ADVANCE",
    });
  });

  it("parses staff reimbursement with amount", () => {
    const m = matchNovaSafeWorkflowOpen("create expense reimbursement for 2500");
    expect(m).toMatchObject({
      formId: "staff_reimbursement",
      type: "STAFF_EXPENSE_REIMBURSEMENT",
      amount: 2500,
    });
  });

  it("parses task with preserved title casing", () => {
    const m = matchNovaSafeWorkflowOpen("create task titled Review Site Photos");
    expect(m).toMatchObject({
      formId: "task_new",
      title: "Review Site Photos",
    });
  });

  it("parses clear task edit titled asks (never bare edit task)", () => {
    const m = matchNovaSafeWorkflowOpen("edit task titled Review Site Photos");
    expect(m).toMatchObject({
      formId: "task_edit",
      titleHint: "Review Site Photos",
    });
    expect(matchNovaSafeWorkflowOpen("edit task")).toBeNull();
    expect(matchNovaSafeWorkflowOpen("update task titled Follow up")).toMatchObject({
      formId: "task_edit",
      titleHint: "Follow up",
    });
  });

  it("parses leave apply with dates + type hint", () => {
    const m = matchNovaSafeWorkflowOpen(
      "apply for casual leave from 2026-07-21 to 2026-07-22 reason family event"
    );
    expect(m).toMatchObject({
      formId: "leave_new",
      leaveTypeHint: "casual",
      fromDate: "2026-07-21",
      toDate: "2026-07-22",
      reason: "family event",
    });
  });

  it("parses regularisation missed punch with date", () => {
    const m = matchNovaSafeWorkflowOpen(
      "request regularisation for missed punch in on 2026-07-18"
    );
    expect(m).toMatchObject({
      formId: "regularisation_new",
      requestType: "MISSED_PUNCH_IN",
      date: "2026-07-18",
    });
  });

  it("does not map leave balance or howto leave", () => {
    expect(matchNovaSafeWorkflowOpen("leave balance")).toBeNull();
    expect(matchNovaSafeWorkflowOpen("how to apply for leave")).toBeNull();
    expect(matchNovaSafeWorkflowOpen("who is on leave today")).toBeNull();
  });

  it("purchase beats payment when both nouns appear", () => {
    const m = matchNovaSafeWorkflowOpen(
      "create a purchase request for vendor acme for item cable for 5000"
    );
    expect(m?.formId).toBe("purchase_request_new");
  });

  it("does not map howto / approve / delete", () => {
    expect(matchNovaSafeWorkflowOpen("how to create a payment request")).toBeNull();
    expect(matchNovaSafeWorkflowOpen("approve this payment request")).toBeNull();
    expect(matchNovaSafeWorkflowOpen("delete payment request")).toBeNull();
    expect(isNovaSafeWorkflowHardWriteCue("approve this payment request")).toBe(true);
    expect(isNovaPurchaseRequestCue("create a purchase request")).toBe(true);
    expect(
      isNovaSafeWorkflowOpenQuery("create a payment request for vendor keshav raj for 4000")
    ).toBe(true);
  });

  it("exports form paths", () => {
    expect(safeWorkflowFormPath("task_new")).toBe("/tasks/new");
    expect(safeWorkflowFormPath("leave_new")).toBe("/attendance-hr/leave");
    expect(safeWorkflowFormPath("regularisation_new")).toBe(
      "/attendance-hr/regularisation"
    );
    expect(formIdFromSafeWorkflowHrefPath("/purchase-requests/new")).toBe(
      "purchase_request_new"
    );
    expect(formIdFromSafeWorkflowHrefPath("/attendance-hr/leave")).toBe("leave_new");
  });
});

describe("safe workflow url", () => {
  it("builds prefill URLs for each surface", () => {
    expect(parseNovaWorkflowPrefillAmount("4000")).toBe(4000);
    expect(parseNovaWorkflowPrefillAmount("0")).toBeUndefined();

    const pr = buildNovaWorkflowPrefillUrl({
      formId: "payment_request_new",
      type: "VENDOR_PAYMENT",
      vendor: "vend_1",
      amount: 4000,
    });
    expect(pr).toContain("/payment-requests/new?");
    expect(pr).toContain("nova_prefill=1");
    expect(pr).toContain("type=VENDOR_PAYMENT");

    const purchase = buildNovaWorkflowPrefillUrl({
      formId: "purchase_request_new",
      item: "FRP tank",
      amount: 12000,
    });
    expect(purchase).toContain("/purchase-requests/new?");
    expect(purchase).toContain("item=FRP+tank");

    const task = buildNovaWorkflowPrefillUrl({
      formId: "task_new",
      title: "Review Site Photos",
      assignee: "u-1",
    });
    expect(task).toContain("/tasks/new?");
    expect(task).toContain("title=Review+Site+Photos");

    const leave = buildNovaWorkflowPrefillUrl({
      formId: "leave_new",
      leaveTypeId: "lt-1",
      fromDate: "2026-07-21",
      toDate: "2026-07-22",
      reason: "family event",
    });
    expect(leave).toContain("/attendance-hr/leave?");
    expect(leave).toContain("leaveTypeId=lt-1");
    expect(leave).toContain("fromDate=2026-07-21");

    const reg = buildNovaWorkflowPrefillUrl({
      formId: "regularisation_new",
      requestType: "MISSED_PUNCH_IN",
      date: "2026-07-18",
    });
    expect(reg).toContain("/attendance-hr/regularisation?");
    expect(reg).toContain("requestType=MISSED_PUNCH_IN");
    expect(reg).toContain("date=2026-07-18");
  });

  it("parses href and maps staff advance type", () => {
    const href = buildNovaWorkflowPrefillUrl({
      formId: "staff_advance",
      type: "STAFF_ADVANCE",
      amount: 5000,
    });
    expect(isNovaSafeWorkflowPrefillHref(href)).toBe(true);
    const parsed = parseNovaSafeWorkflowHref(href);
    expect(parsed?.formId).toBe("staff_advance");
    expect(parsed?.fields.type).toBe("STAFF_ADVANCE");
    expect(parsed?.fields.amount).toBe("5000");
  });
});

describe("same-tab fill bridge", () => {
  afterEach(() => {
    __resetSafeWorkflowFillTargetsForTests();
  });

  it("applies fill when already on matching form", () => {
    const applied: string[] = [];
    subscribeSafeWorkflowFill({
      formId: "payment_request_new",
      apply: (d) => {
        applied.push(d.formId);
      },
    });
    const href = buildNovaWorkflowPrefillUrl({
      formId: "payment_request_new",
      type: "VENDOR_PAYMENT",
      vendor: "v1",
      amount: 100,
    });
    const res = trySameTabSafeWorkflowFill({
      href,
      pathname: "/payment-requests/new",
    });
    expect(res.ok).toBe(true);
    expect(res.reason).toBe("applied");
    expect(applied).toHaveLength(1);
  });

  it("returns not_on_form when pathname mismatches", () => {
    const res = trySameTabSafeWorkflowFill({
      href: buildNovaWorkflowPrefillUrl({ formId: "task_new", title: "Test" }),
      pathname: "/tasks",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_on_form");
  });
});

describe("write-deny still blocks real mutations", () => {
  it("approve / delete / mark paid remain write mutations", () => {
    expect(isNovaWriteMutationQuery("approve this payment request")).toBe(true);
    expect(isNovaWriteMutationQuery("delete this purchase bill")).toBe(true);
    expect(isNovaWriteMutationQuery("mark paid this invoice")).toBe(true);
    expect(preflightNovaWriteDeny("please approve this payment")?.toolsUsed).toContain(
      "read_only_guard"
    );
  });

  it("slotted payment-request create is not a write mutation", () => {
    expect(
      isNovaWriteMutationQuery(
        "create a payment request for vendor keshav raj for 4000"
      )
    ).toBe(false);
  });
});

describe("tryAnswerNovaSafeWorkflow + answerNovaQuery", () => {
  const prev = process.env.NOVA_SAFE_WORKFLOW_OPEN;

  beforeEach(() => {
    process.env.NOVA_SAFE_WORKFLOW_OPEN = "1";
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([
      {
        id: "cuid-keshav",
        vendorId: "V-KR",
        vendorName: "Keshav Raj",
      },
    ] as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      {
        id: "proj-1",
        projectId: "P-001",
        projectName: "Alpha Site",
      },
    ] as never);
    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      {
        id: "sp-1",
        fullName: "John Doe",
        staffCode: "E001",
        userId: "u-john",
      },
    ] as never);
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.NOVA_SAFE_WORKFLOW_OPEN;
    else process.env.NOVA_SAFE_WORKFLOW_OPEN = prev;
  });

  it("wf-pr-open-prefill: opens form with vendor + amount", async () => {
    const res = await tryAnswerNovaSafeWorkflow(
      adminUser(),
      "create a payment request for vendor keshav raj for 4000"
    );
    expect(res?.toolsUsed).toContain("workflow_open");
    expect(res?.toolsUsed).toContain("form:payment_request_new");
    expect(res?.answer).toMatch(/Opened form — review and submit yourself/i);
    expect(res?.answer).not.toMatch(/\b(created|submitted|paid)\b/i);
    const href = res?.links[0]?.href ?? "";
    expect(href).toContain("/payment-requests/new?");
    expect(href).toContain("nova_prefill=1");
    expect(href).toContain("vendor=cuid-keshav");
    expect(href).toContain("amount=4000");
  });

  it("wf-pr-rbac-deny: staff without create gets permission_help", async () => {
    const res = await tryAnswerNovaSafeWorkflow(
      staffNoCreate(),
      "create a payment request for vendor keshav raj for 4000"
    );
    expect(res?.toolsUsed).toContain("permission_help");
    expect(res?.links.some((l) => l.href.includes("/payment-requests/new"))).toBe(false);
  });

  it("opens purchase request for admin", async () => {
    const res = await tryAnswerNovaSafeWorkflow(
      adminUser(),
      "create a purchase request for item FRP tank for 12000"
    );
    expect(res?.toolsUsed).toContain("form:purchase_request_new");
    expect(res?.links[0]?.href).toContain("/purchase-requests/new?");
    expect(res?.links[0]?.href).toContain("item=FRP+tank");
  });

  it("purchase rbac deny for DIRECTOR", async () => {
    const res = await tryAnswerNovaSafeWorkflow(
      directorUser(),
      "create a purchase request for item cable for 5000"
    );
    expect(res?.toolsUsed).toContain("permission_help");
    expect(res?.links.some((l) => l.href.includes("/purchase-requests/new"))).toBe(false);
  });

  it("opens staff advance", async () => {
    const res = await tryAnswerNovaSafeWorkflow(adminUser(), "create staff advance for 8000");
    expect(res?.toolsUsed).toContain("form:staff_advance");
    expect(res?.links[0]?.href).toContain("type=STAFF_ADVANCE");
  });

  it("opens staff reimbursement", async () => {
    const res = await tryAnswerNovaSafeWorkflow(
      adminUser(),
      "create expense reimbursement for 1500"
    );
    expect(res?.toolsUsed).toContain("form:staff_reimbursement");
    expect(res?.links[0]?.href).toContain("type=STAFF_EXPENSE_REIMBURSEMENT");
  });

  it("opens task for STAFF with flag on", async () => {
    const res = await tryAnswerNovaSafeWorkflow(
      staffUser(),
      "create task titled Follow up with vendor"
    );
    expect(res?.toolsUsed).toContain("form:task_new");
    expect(res?.links[0]?.href).toContain("/tasks/new?");
    expect(res?.links[0]?.href).toContain("title=Follow+up+with+vendor");
  });

  it("opens leave with resolved type + dates", async () => {
    vi.mocked(prisma.hrLeaveType.findMany).mockResolvedValue([
      { id: "lt-casual", name: "Casual Leave", attendanceEffect: "LEAVE" },
    ] as never);
    const res = await tryAnswerNovaSafeWorkflow(
      adminUser(),
      "apply for casual leave from 2026-07-21 to 2026-07-22"
    );
    expect(res?.toolsUsed).toContain("form:leave_new");
    expect(res?.links[0]?.href).toContain("/attendance-hr/leave?");
    expect(res?.links[0]?.href).toContain("leaveTypeId=lt-casual");
    expect(res?.links[0]?.href).toContain("fromDate=2026-07-21");
    expect(res?.links[0]?.href).toContain("toDate=2026-07-22");
    expect(res?.answer).toMatch(/review and submit yourself/i);
  });

  it("opens regularisation for missed punch", async () => {
    const res = await tryAnswerNovaSafeWorkflow(
      adminUser(),
      "request regularisation for missed punch out on 2026-07-18"
    );
    expect(res?.toolsUsed).toContain("form:regularisation_new");
    expect(res?.links[0]?.href).toContain("/attendance-hr/regularisation?");
    expect(res?.links[0]?.href).toContain("requestType=MISSED_PUNCH_OUT");
    expect(res?.links[0]?.href).toContain("date=2026-07-18");
  });

  it("leave rbac deny for director without create", async () => {
    const res = await tryAnswerNovaSafeWorkflow(
      directorUser(),
      "apply for leave from 2026-07-21 to 2026-07-22"
    );
    expect(res?.toolsUsed).toContain("permission_help");
    expect(res?.links.some((l) => l.href.includes("/attendance-hr/leave?"))).toBe(false);
  });

  it("wf-pr-no-claim-created via answerNovaQuery", async () => {
    const res = await answerNovaQuery(
      adminUser(),
      "create a payment request for vendor keshav raj for 4000"
    );
    expect(res.toolsUsed).toContain("workflow_open");
    expect(res.toolsUsed).not.toContain("read_only_guard");
    expect(res.answer).not.toMatch(/\b(I created|submitted|marked paid)\b/i);
  });

  it("approve still write-denies through answerNovaQuery", async () => {
    const res = await answerNovaQuery(adminUser(), "approve this payment request");
    expect(res.toolsUsed).toContain("read_only_guard");
    expect(res.toolsUsed).not.toContain("workflow_open");
  });
});
