import { describe, expect, it } from "vitest";
import {
  buildProjectCommandDashboardSpine,
  PROJECT_COMMAND_DASHBOARD_CONTRACT_VERSION,
  PROJECT_COMMAND_REPORT_PLANE_GATE,
} from "@/lib/nova/packs/project-command-dashboard";
import {
  PROJECT_COMMAND_METRIC_IDS,
  PROJECT_COMMAND_PACK_ID,
  PROJECT_COMMAND_GOLDENS,
} from "@/lib/nova/packs/project-command-prep";

describe("Project Command dashboard contract (prep lite)", () => {
  it("builds spine chapters aligned to pack metrics and hard-gates report plane", () => {
    const spine = buildProjectCommandDashboardSpine({
      project: {
        id: "cuid-1",
        projectId: "C0001-P001",
        projectName: "James School",
        status: "CONFIRMED",
        customerName: "James",
      },
      counts: {
        taskOpen: 3,
        checklistOpen: 1,
        salesOrderCount: 2,
        purchaseOrderCount: 4,
        deliveryCount: 5,
        invoiceCount: 6,
        overdueInvoiceCount: 1,
        invoicedTotal: 1000,
        receivedTotal: 400,
        outstandingTotal: 49600,
        invoiceOutstandingTotal: 600,
        customerCreditTotal: 0,
        projectValue: 50000,
        budget: 45000,
      },
      dataAsOf: "2026-07-14T00:00:00.000Z",
    });

    expect(spine.contractVersion).toBe(PROJECT_COMMAND_DASHBOARD_CONTRACT_VERSION);
    expect(spine.packId).toBe(PROJECT_COMMAND_PACK_ID);
    expect(spine.reportPlane).toEqual(PROJECT_COMMAND_REPORT_PLANE_GATE);
    expect(spine.reportPlane.saveReportAvailable).toBe(false);
    expect(spine.chapters.find((c) => c.id === "milestones")?.deferred).toBe(true);

    const metricIds = spine.chapters
      .map((c) => c.metricId)
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    for (const id of metricIds) {
      expect(PROJECT_COMMAND_METRIC_IDS).toContain(id);
    }

    expect(spine.chapters.find((c) => c.id === "tasks")?.count).toBe(3);
    expect(spine.chapters.find((c) => c.id === "spine")?.display).toMatch(/outstanding/);
    expect(spine.chapters.find((c) => c.id === "spine")?.display).toMatch(/invoice outstanding/);
    expect(spine.routingNotes.some((n) => /James School|named project/i.test(n))).toBe(
      true
    );
  });

  it("marks omitted chapters without inventing counts when RBAC omits money", () => {
    const spine = buildProjectCommandDashboardSpine({
      project: {
        id: "cuid-2",
        projectId: "C0002-P001",
        projectName: "Tata plant",
        status: "IN_PROGRESS",
        customerName: "Tata",
      },
      counts: {
        taskOpen: 0,
        checklistOpen: 0,
        salesOrderCount: 0,
        purchaseOrderCount: 0,
        deliveryCount: 0,
        invoiceCount: 0,
        overdueInvoiceCount: 0,
        invoicedTotal: null,
        receivedTotal: null,
        outstandingTotal: null,
        customerCreditTotal: null,
        projectValue: null,
        budget: null,
      },
      omittedChapters: {
        cash: { omitted: true, omitReason: "Missing receipt.read" },
      },
    });

    const cash = spine.chapters.find((c) => c.id === "cash");
    expect(cash?.omitted).toBe(true);
    expect(cash?.display).toBe("hidden");
    expect(cash?.omitReason).toMatch(/receipt\.read/);
  });

  it("preserves James School goldens on project_command recipe (no dashboard rewrite)", () => {
    const james = PROJECT_COMMAND_GOLDENS.filter((g) => g.id.startsWith("pc-james"));
    expect(james.length).toBeGreaterThanOrEqual(2);
    expect(james.every((g) => g.expectRecipeId === "project_command")).toBe(true);
  });
});
