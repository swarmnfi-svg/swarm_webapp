/**
 * Architectural CI — NOVA 3.0 invariants.
 * Skills must not import write-capable prisma; no free SQL / write tools.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  NOVA_INVARIANTS,
  NOVA_MONTH_ATTENTION_PRIMARY_MAX,
  NOVA_PACK_RESULT_SCHEMA_VERSION,
} from "@/lib/nova/invariants";
import {
  assertNovaPackAttentions,
  buildNovaPackResult,
  selectNovaPackAttentions,
} from "@/lib/nova/pack-result";
import {
  assertNovaReportEnvelope,
  buildNovaReportSecurityEnvelope,
  defaultNovaReportExpiresAt,
} from "@/lib/nova/report-envelope";
import { buildNovaFinding } from "@/lib/nova/recipes/finding";
import { listNovaSkills } from "@/lib/nova/skills/registry";
import { isNovaReadonlyUsingDedicatedUrl } from "@/lib/nova/prisma-readonly";
import { assertCertifiedBindingsAgainstDictionary } from "@/lib/nova/semantic/certified-bindings";

const ROOT = path.resolve(__dirname, "../../..");
const SKILLS_DIR = path.join(ROOT, "src/lib/nova/skills");

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkTsFiles(p));
    else if (ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("NOVA invariants freeze", () => {
  it("locks forever-forbidden product surfaces", () => {
    expect(NOVA_INVARIANTS.neverWriteOperationalErp).toBe(true);
    expect(NOVA_INVARIANTS.catalogSkillsOnly).toBe(true);
    expect(NOVA_INVARIANTS.rulesFirstGatedThink).toBe(true);
    expect(NOVA_INVARIANTS.novaPlaneWritesOnly).toBe(true);
    expect(NOVA_INVARIANTS.reportsImmutableSnapshots).toBe(true);
    expect(NOVA_INVARIANTS.foreverForbidden).toContain("dashboard_builder");
    expect(NOVA_INVARIANTS.foreverForbidden).toContain("free_sql");
    expect(NOVA_INVARIANTS.foreverForbidden).toContain("erp_writeback");
    expect(NOVA_INVARIANTS.foreverForbidden).toContain("sticky_money_memory");
  });

  it("Month attentions cap is 3", () => {
    expect(NOVA_MONTH_ATTENTION_PRIMARY_MAX).toBe(3);
  });
});

describe("architectural: skills prisma isolation", () => {
  const skillFiles = walkTsFiles(SKILLS_DIR).filter(
    (f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts")
  );

  it("skills do not import write-capable @/lib/prisma", () => {
    const offenders: string[] = [];
    for (const file of skillFiles) {
      const src = fs.readFileSync(file, "utf8");
      if (/from\s+["']@\/lib\/prisma["']/.test(src)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("skills do not use $executeRaw / $queryRawUnsafe / free SQL helpers", () => {
    const offenders: string[] = [];
    for (const file of skillFiles) {
      const src = fs.readFileSync(file, "utf8");
      if (
        /\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe|prisma\.\$queryRaw\b/.test(
          src
        )
      ) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("registered skills are read riskLevel (no write tools)", () => {
    for (const skill of listNovaSkills()) {
      expect(skill.riskLevel).toBe("read");
      expect(skill.toolId).not.toMatch(/\b(create|update|delete|approve|reject|write)\b/i);
    }
  });

  it("skill source files prefer nova prisma-readonly import when using prisma", () => {
    const missingReadonly: string[] = [];
    for (const file of skillFiles) {
      const src = fs.readFileSync(file, "utf8");
      if (!/\bprisma\b/.test(src)) continue;
      if (/from\s+["']@\/lib\/nova\/prisma-readonly["']/.test(src)) continue;
      // open-* skills / pure helpers may mention prisma only in comments
      if (!/import\s+\{[^}]*prisma/.test(src) && !/novaReadonlyPrisma/.test(src)) {
        continue;
      }
      missingReadonly.push(path.relative(ROOT, file));
    }
    expect(missingReadonly).toEqual([]);
  });
});

describe("NovaPackResult + attentions", () => {
  it("selects up to 3 primary; overflow when more; none when empty", () => {
    expect(selectNovaPackAttentions([])).toEqual({ primary: [], overflowCount: 0 });

    const mk = (obs: string) =>
      buildNovaFinding({
        observation: obs,
        evidence: [{ toolId: "overdue_invoices", summary: obs }],
        contributors: [{ toolId: "overdue_invoices", role: "source" }],
        confidence: "fact",
      });

    const three = selectNovaPackAttentions([mk("a"), mk("b"), mk("c")]);
    expect(three.primary).toHaveLength(3);
    expect(three.overflowCount).toBe(0);
    expect(assertNovaPackAttentions(three)).toEqual([]);

    const five = selectNovaPackAttentions([mk("a"), mk("b"), mk("c"), mk("d"), mk("e")]);
    expect(five.primary).toHaveLength(3);
    expect(five.overflowCount).toBe(2);

    const pack = buildNovaPackResult({
      packId: "month_performance",
      packVersion: "1.0.0",
      period: {
        label: "Jul 2026",
        grain: "month",
        calendarKind: "calendar_month",
        source: "explicit",
      },
      dataAsOf: new Date().toISOString(),
      metrics: [],
      facts: [],
      findings: five.primary,
      attentions: five,
      charts: [],
      links: [],
      warnings: [
        {
          code: "permission_omission",
          message: "Bank chapter omitted (permission).",
          source: "bank_accounts_summary",
        },
      ],
      omittedNotes: ["Omitted bank_accounts_summary (permission)."],
      narrativeHints: ["Period-explicit month summary."],
    });
    expect(pack.schemaVersion).toBe(NOVA_PACK_RESULT_SCHEMA_VERSION);
    expect(pack.warnings[0]?.code).toBe("permission_omission");
  });
});

describe("NovaReportSecurityEnvelope", () => {
  it("builds envelope with required security fields", () => {
    const envelope = buildNovaReportSecurityEnvelope({
      tenantId: "org1",
      ownerUserId: "u1",
      packId: "month_performance",
      packVersion: "1.0.0",
      packSchemaVersion: NOVA_PACK_RESULT_SCHEMA_VERSION,
      metricVersions: { "sales.period_total": "1" },
      sensitivity: "standard",
      permissionsUsed: ["invoice.read", "accounts.reports.read"],
      dataAsOf: "2026-07-13T00:00:00.000Z",
      expiresAt: defaultNovaReportExpiresAt(new Date("2026-07-13T00:00:00.000Z")),
      checksum: "abc123",
      objectKeys: ["nova/reports/org1/u1/r1/snapshot.json"],
    });
    expect(envelope.schemaVersion).toBe(1);
    expect(assertNovaReportEnvelope(envelope)).toEqual([]);
    expect(envelope.expiresAt).toMatch(/^2026-10-/);
  });
});

describe("nova readonly client scaffold", () => {
  it("exports dedicated-url detector (false until env set)", () => {
    expect(typeof isNovaReadonlyUsingDedicatedUrl()).toBe("boolean");
  });
});

describe("Sprint 4 certified metric bindings", () => {
  it("Month/Project/Collection registries match dictionary + full contract", () => {
    expect(assertCertifiedBindingsAgainstDictionary()).toEqual([]);
  });
});
