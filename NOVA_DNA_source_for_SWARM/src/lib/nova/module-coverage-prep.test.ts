/**
 * PREP contract smoke — module coverage matrix + gaps (no runtime pipeline).
 */
import { describe, expect, it } from "vitest";
import {
  buildModuleCoveragePrepStub,
  NOVA_MODULE_COVERAGE_GAPS,
  NOVA_MODULE_COVERAGE_GOLDENS,
  NOVA_MODULE_COVERAGE_MATRIX,
  NOVA_MODULE_LEXICON_PROPOSALS,
  NOVA_TOPIC_SWITCH_KEYWORDS,
} from "@/lib/nova/module-coverage-prep";
import { listNovaSkills } from "@/lib/nova/skills/registry";

describe("module-coverage-prep", () => {
  it("stub exposes matrix, P0 gaps, and proposed staff family", () => {
    const stub = buildModuleCoveragePrepStub();
    expect(stub.kind).toBe("module_coverage_prep");
    expect(stub.matrixRows).toBeGreaterThanOrEqual(10);
    expect(stub.gaps).toContain("G1_staff_resolve_missing");
    expect(stub.gaps).toContain("G2_sticky_money_on_staff_x");
    expect(stub.proposedFamilies).toContain("staff");
    expect(stub.goldens).toBeGreaterThanOrEqual(3);
  });

  it("every matrix toolId exists in the skill registry", () => {
    const known = new Set(listNovaSkills().map((s) => s.toolId));
    for (const row of NOVA_MODULE_COVERAGE_MATRIX) {
      for (const toolId of row.toolIds) {
        expect(known.has(toolId), `${row.moduleId} → ${toolId}`).toBe(true);
      }
    }
  });

  it("G1/G2 gap markers name the sticky-money + staff-resolve surfaces", () => {
    const g1 = NOVA_MODULE_COVERAGE_GAPS.find((g) => g.id === "G1_staff_resolve_missing");
    const g2 = NOVA_MODULE_COVERAGE_GAPS.find((g) => g.id === "G2_sticky_money_on_staff_x");
    expect(g1?.priority).toBe("P0");
    expect(g2?.priority).toBe("P0");
    expect(g1?.touchpoints.some((p) => p.includes("staff.ts"))).toBe(true);
    expect(g2?.touchpoints.some((p) => p.includes("dialog-state"))).toBe(true);
  });

  it("topic-switch proposals include staff keywords that clear money", () => {
    const staff = NOVA_TOPIC_SWITCH_KEYWORDS.find((r) => r.family === "staff");
    expect(staff?.status).toBe("proposed");
    expect(staff?.clearsMoneySlots).toBe(true);
    expect(staff?.keywords).toEqual(expect.arrayContaining(["staff", "who is", "employee"]));
  });

  it("lexicon proposals and goldens reference documented gaps", () => {
    expect(NOVA_MODULE_LEXICON_PROPOSALS.some((p) => p.topicId === "staff")).toBe(true);
    expect(
      NOVA_MODULE_COVERAGE_GOLDENS.every((g) =>
        NOVA_MODULE_COVERAGE_GAPS.some((gap) => gap.id === g.gapId)
      )
    ).toBe(true);
  });
});
