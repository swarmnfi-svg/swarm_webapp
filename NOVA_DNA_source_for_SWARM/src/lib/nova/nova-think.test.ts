import { describe, expect, it } from "vitest";
import { validateNovaSearchSlots } from "@/lib/nova/nova-search-engine";
import { isNovaThinkEnabled } from "@/lib/nova/nova-think";

describe("NovaThink gate + schema", () => {
  it("isNovaThinkEnabled respects NOVA_THINK / NOVA_LLM_PLANNER", () => {
    const prevThink = process.env.NOVA_THINK;
    const prevPlanner = process.env.NOVA_LLM_PLANNER;
    try {
      delete process.env.NOVA_THINK;
      delete process.env.NOVA_LLM_PLANNER;
      expect(isNovaThinkEnabled()).toBe(false);
      process.env.NOVA_THINK = "true";
      expect(isNovaThinkEnabled()).toBe(true);
      delete process.env.NOVA_THINK;
      process.env.NOVA_LLM_PLANNER = "1";
      expect(isNovaThinkEnabled()).toBe(true);
    } finally {
      if (prevThink === undefined) delete process.env.NOVA_THINK;
      else process.env.NOVA_THINK = prevThink;
      if (prevPlanner === undefined) delete process.env.NOVA_LLM_PLANNER;
      else process.env.NOVA_LLM_PLANNER = prevPlanner;
    }
  });

  it("Think output must pass SearchEngine slot validation (no free tools)", () => {
    const allow = new Set(["tasks_summary", "search_entities", "sales_summary", "staff_summary"]);
    const bad = validateNovaSearchSlots(
      {
        intent: "evil",
        queryFamily: "money",
        tools: ["free_sql", "sales_summary"],
        confidence: "high",
      },
      allow
    );
    expect(bad?.tools).toEqual(["sales_summary"]);

    const whoIs = validateNovaSearchSlots(
      {
        intent: "who_is_employee",
        queryFamily: "people",
        entityType: "employee",
        entityHint: "arun",
        tools: ["staff_summary"],
        confidence: "high",
      },
      allow
    );
    expect(whoIs?.tools).toEqual(["staff_summary"]);
    expect(whoIs?.queryFamily).toBe("people");

    const scoped = validateNovaSearchSlots(
      {
        intent: "tasks_for_project",
        queryFamily: "status",
        entityType: "project",
        entityHint: "tata steels 800",
        metric: "tasks",
        tools: ["tasks_summary"],
        confidence: "high",
        suppressPersonHint: true,
      },
      allow
    );
    expect(scoped?.tools).toEqual(["tasks_summary"]);
    expect(scoped?.entityHint).toMatch(/tata steels 800/i);
    expect(scoped?.suppressPersonHint).toBe(true);
  });

  it("Think entityKindHint + stripped entityHint (role words peeled)", () => {
    const allow = new Set(["tasks_summary", "project_command", "search_entities"]);
    const withKind = validateNovaSearchSlots(
      {
        intent: "tasks_for_entity",
        queryFamily: "status",
        entityKindHint: "project",
        entityHint: "Avaada project task",
        tools: ["tasks_summary"],
        confidence: "high",
        suppressPersonHint: true,
      } as Parameters<typeof validateNovaSearchSlots>[0],
      allow
    );
    expect(withKind?.entityHint).toBe("Avaada");
    expect(withKind?.entityType).toBe("project");
    expect(withKind?.tools).toEqual(["tasks_summary"]);

    const kindOnly = validateNovaSearchSlots(
      {
        intent: "named_project",
        queryFamily: "resolve",
        entityKindHint: "project",
        entityHint: "James School",
        tools: ["search_entities"],
        confidence: "high",
      } as Parameters<typeof validateNovaSearchSlots>[0],
      allow
    );
    expect(kindOnly?.entityType).toBe("project");
    expect(kindOnly?.entityHint?.toLowerCase()).toBe("james school");
  });
});
