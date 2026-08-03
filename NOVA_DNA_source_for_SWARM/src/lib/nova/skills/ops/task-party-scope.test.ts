/**
 * Customer vs project task-scope captions (james school tasks regression).
 */
import { describe, expect, it } from "vitest";
import {
  buildTasksPartyScope,
  buildTasksPartyScopeNote,
  normalizeEntityFilterLabel,
} from "@/lib/nova/skills/ops/task-party-scope";
import { formatTasksSummaryPolished } from "@/lib/nova/presentation/tasks";
import { formatFactsPolished } from "@/lib/ai/nova-format";

const softSearch = (hint: string) => ({
  OR: [{ title: { contains: hint, mode: "insensitive" as const } }],
});

describe("task party scope — james school customer bind", () => {
  it("trims trailing-space labels", () => {
    expect(normalizeEntityFilterLabel("James school ")).toBe("James school");
    expect(normalizeEntityFilterLabel("  James   school  ")).toBe("James school");
  });

  it("customer bind → customerScoped, never project trust copy", () => {
    const scope = buildTasksPartyScope({
      resolvedEntityType: "customer",
      resolvedEntityDbId: "cust_c0026",
      entityFilterName: "James school ",
      taskTextSearch: softSearch,
    });
    expect(scope.kind).toBe("customer");
    expect(scope.customerScoped).toBe(true);
    expect(scope.projectScoped).toBe(false);
    expect(scope.label).toBe("James school");
    expect(scope.where).toEqual({ project: { customerId: "cust_c0026" } });

    const note = buildTasksPartyScopeNote({
      projectScoped: scope.projectScoped,
      customerScoped: scope.customerScoped,
      label: scope.label,
    });
    expect(note).toMatch(/customer “James school”/i);
    expect(note).toMatch(/across their projects/i);
    expect(note).not.toMatch(/project-filtered|never report org-wide/i);
    expect(note).not.toMatch(/scoped to project/i);
  });

  it("project bind keeps Avaada-style project trust copy", () => {
    const scope = buildTasksPartyScope({
      resolvedEntityType: "project",
      resolvedEntityDbId: "proj_avaada",
      entityFilterName: "Avaada",
      taskTextSearch: softSearch,
    });
    expect(scope.projectScoped).toBe(true);
    expect(scope.customerScoped).toBe(false);
    const note = buildTasksPartyScopeNote({
      projectScoped: true,
      customerScoped: false,
      label: "Avaada",
    });
    expect(note).toMatch(/scoped to project “Avaada”/i);
    expect(note).toMatch(/project-filtered — never report org-wide/i);
    expect(note).not.toMatch(/customer/i);
  });

  it("soft name filter does not claim projectScoped", () => {
    const scope = buildTasksPartyScope({
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      entityFilterName: "loose name",
      taskTextSearch: softSearch,
    });
    expect(scope.kind).toBe("soft");
    expect(scope.projectScoped).toBe(false);
    expect(scope.customerScoped).toBe(false);
  });
});

describe("task presentation — no customer+project double claim", () => {
  it("james school customer-scoped polished caption", () => {
    const text = formatTasksSummaryPolished({
      openCount: 2,
      overdueCount: 0,
      entityFilter: "James school ",
      customerScoped: true,
      projectScoped: false,
      samples: [
        {
          no: "T-1",
          title: "Site clear",
          status: "TODO",
          assigneeNames: ["Ada"],
          project: { name: "James school 3 cum" },
        },
      ],
    });
    expect(text).toContain("## Tasks summary — customer James school");
    expect(text).toMatch(/Filtered to customer \*\*James school\*\*/);
    expect(text).not.toMatch(/Scoped to project|project-filtered|never report org-wide/i);
  });

  it("project-scoped polished caption stays project-only", () => {
    const text = formatTasksSummaryPolished({
      openCount: 1,
      overdueCount: 0,
      entityFilter: "Avaada",
      customerScoped: false,
      projectScoped: true,
    });
    expect(text).toContain("## Tasks summary — project Avaada");
    expect(text).toMatch(/Scoped to project \*\*Avaada\*\*/);
    expect(text).not.toMatch(/Filtered to customer/i);
  });

  it("formatFactsPolished mirrors customer-only scope line", () => {
    const text = formatFactsPolished("james school tasks", [
      {
        tool: "tasks_summary",
        ok: true,
        data: {
          openCount: 2,
          overdueCount: 0,
          entityFilter: "James school",
          customerScoped: true,
          projectScoped: false,
          samples: [],
        },
      },
    ]);
    expect(text).toContain("## Tasks summary — customer James school");
    expect(text).toMatch(/Filtered to customer \*\*James school\*\*/);
    expect(text).not.toMatch(/Scoped to project|project-filtered/i);
  });
});
