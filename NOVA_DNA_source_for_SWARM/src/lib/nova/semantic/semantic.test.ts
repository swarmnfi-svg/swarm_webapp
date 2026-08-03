import { describe, expect, it, vi } from "vitest";
import {
  assertNovaMetricContract,
  listNovaMetrics,
  novaGateARequiredToolIds,
  novaMetricsCoverToolIds,
} from "@/lib/nova/semantic/metrics";
import {
  assertCertifiedBindingsAgainstDictionary,
  assertFullMetricContract,
  listCertifiedMonthBindings,
  listDraftCollectionBindings,
  listDraftProjectBindings,
  listSprint4MetricRegistry,
  SPRINT4_COLLECTION_METRIC_IDS,
  SPRINT4_MONTH_METRIC_IDS,
  SPRINT4_PROJECT_METRIC_IDS,
} from "@/lib/nova/semantic/certified-bindings";
import {
  assertReadonlyCutoverChecklistShape,
  listPrismaUsageMap,
  listReadonlyCutoverSteps,
} from "@/lib/nova/semantic/readonly-cutover";
import {
  listAliasableNovaEntityTypes,
  listNovaEntityTypes,
  NOVA_ONTOLOGY_GATE_A_IDS,
} from "@/lib/nova/semantic/ontology";
import {
  matchSeedConfirmedAlias,
  novaAliasIsLive,
  resolveNovaAliasTarget,
} from "@/lib/nova/semantic/aliases";
import { prisma } from "@/lib/prisma";
import { DAILY_BRIEF_PACKS } from "@/lib/nova/skills/ops/daily-brief";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    novaEntityAlias: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    customer: { findUnique: vi.fn() },
    vendor: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    staffProfile: { findUnique: vi.fn() },
  },
}));

describe("NOVA metrics dictionary v1", () => {
  it("every metric has required contract fields", () => {
    for (const m of listNovaMetrics()) {
      expect(assertNovaMetricContract(m), m.id).toEqual([]);
    }
  });

  it("covers daily_brief ∪ collection_attention toolIds (Gate A)", () => {
    const briefIds = [
      ...DAILY_BRIEF_PACKS.director,
      ...DAILY_BRIEF_PACKS.manager,
      ...DAILY_BRIEF_PACKS.accountant,
      ...DAILY_BRIEF_PACKS.staff,
    ];
    const required = novaGateARequiredToolIds(briefIds);
    const { missing } = novaMetricsCoverToolIds(required);
    expect(missing, `missing metrics for: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("Sprint 4 certified metric contract", () => {
  it("Month/Project/Collection registries pass full contract + dictionary drift", () => {
    expect(assertCertifiedBindingsAgainstDictionary()).toEqual([]);
    for (const b of listSprint4MetricRegistry()) {
      expect(assertFullMetricContract(b), b.id).toEqual([]);
    }
  });

  it("Month is certified; Project and Collection stay draft", () => {
    expect(listCertifiedMonthBindings().every((b) => b.certification === "certified")).toBe(
      true
    );
    expect(listDraftProjectBindings().every((b) => b.certification === "draft")).toBe(true);
    expect(listDraftCollectionBindings().every((b) => b.certification === "draft")).toBe(true);
    expect(SPRINT4_MONTH_METRIC_IDS).toHaveLength(8);
    expect(SPRINT4_PROJECT_METRIC_IDS).toHaveLength(8);
    expect(SPRINT4_COLLECTION_METRIC_IDS).toHaveLength(4);
  });

  it("readonly cutover checklist + prisma usage map are shaped", () => {
    expect(assertReadonlyCutoverChecklistShape()).toEqual([]);
    expect(listReadonlyCutoverSteps()[0]?.id).toBe("gate_sprint3");
    expect(listPrismaUsageMap().some((e) => e.lane === "skill_readonly")).toBe(true);
    expect(listPrismaUsageMap().some((e) => e.lane === "nova_plane_write")).toBe(true);
  });
});

describe("BIOPOWER ontology v1", () => {
  it("includes Gate A entity types", () => {
    const ids = new Set(listNovaEntityTypes().map((e) => e.id));
    for (const id of NOVA_ONTOLOGY_GATE_A_IDS) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("marks customer/vendor/project/employee aliasable", () => {
    const aliasable = new Set(listAliasableNovaEntityTypes().map((e) => e.id));
    expect(aliasable.has("customer")).toBe(true);
    expect(aliasable.has("vendor")).toBe(true);
    expect(aliasable.has("project")).toBe(true);
    expect(aliasable.has("employee")).toBe(true);
    expect(aliasable.has("invoice")).toBe(false);
  });
});

describe("Governed aliases", () => {
  it("seed Tata plant resolves uniquely in tests; drafts are not live", () => {
    const hit = matchSeedConfirmedAlias("Tata plant");
    expect(hit?.entityType).toBe("project");
    expect(hit?.status).toBe("CONFIRMED");
    expect(novaAliasIsLive("DRAFT")).toBe(false);
    expect(novaAliasIsLive("CONFIRMED")).toBe(true);
  });

  it("refuses fictional seed target ids and missing ERP rows", async () => {
    await expect(
      resolveNovaAliasTarget({ entityType: "project", targetId: "seed-project-tata-plant" })
    ).resolves.toBeNull();
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
    await expect(
      resolveNovaAliasTarget({ entityType: "project", targetId: "missing-cuid" })
    ).resolves.toBeNull();
  });
});
