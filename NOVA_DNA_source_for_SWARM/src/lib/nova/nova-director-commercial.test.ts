/**
 * Automated stand-ins for commercial director acceptance (CD*) where unit-testable.
 * Live CD18–CD22 (tenant session Save → download → revoke) remain steward/human.
 */
import { describe, expect, it } from "vitest";
import { buildNovaPackResult, selectNovaPackAttentions } from "@/lib/nova/pack-result";
import { buildNovaFinding } from "@/lib/nova/recipes/finding";
import { recipeMatchesQuery } from "@/lib/nova/recipes/registry";
import { NOVA_MONTH_ATTENTION_PRIMARY_MAX, NOVA_INVARIANTS } from "@/lib/nova/invariants";
import {
  listCertifiedMonthBindings,
  listDraftProjectBindings,
  listDraftCollectionBindings,
} from "@/lib/nova/semantic/certified-bindings";
import {
  checksumNovaPack,
  recheckNovaReportPermissions,
  renderNovaReportText,
} from "@/lib/nova/reports/report-service";
import {
  buildNovaReportSecurityEnvelope,
  defaultNovaReportExpiresAt,
} from "@/lib/nova/report-envelope";
import { renderNovaReportPdf } from "@/lib/nova/reports/render-artifacts";
import { planRegeneratedNovaReportId } from "@/lib/nova/reports/snapshot";
import { MONTH_PERFORMANCE_PACK_VERSION } from "@/lib/nova/packs/month-performance";
import { isNovaWriteMutationQuery, preflightNovaWriteDeny } from "@/lib/ai/nova-write-guards";
import { runNovaSearchEngine } from "@/lib/nova/nova-search-engine";

function monthPack(opts?: { attentions?: number }) {
  const mk = (s: string) =>
    buildNovaFinding({
      observation: s,
      evidence: [{ toolId: "overdue_invoices", summary: s }],
      contributors: [{ toolId: "overdue_invoices", role: "x" }],
      confidence: "fact",
    });
  const findings = Array.from({ length: opts?.attentions ?? 0 }, (_, i) =>
    mk(`Attention ${i + 1}`)
  );
  const attentions = selectNovaPackAttentions(findings);
  return buildNovaPackResult({
    packId: "month_performance",
    packVersion: MONTH_PERFORMANCE_PACK_VERSION,
    period: {
      label: "Jul 2026",
      grain: "month",
      calendarKind: "calendar_month",
      source: "explicit",
    },
    dataAsOf: "2026-07-13T00:00:00.000Z",
    metrics: [
      {
        metricId: "sales.period_total",
        version: "1",
        value: 100,
        display: "₹100",
        certification: "certified",
      },
      {
        metricId: "receipts.period_total",
        version: "1",
        value: 80,
        display: "₹80",
        certification: "certified",
      },
    ],
    facts: [],
    findings,
    attentions,
    charts: [
      {
        bindingId: "kpi_strip",
        metricIds: ["sales.period_total", "receipts.period_total"],
        title: "KPI",
        points: [
          { label: "Sales", value: 100, unit: "inr" },
          { label: "Collections", value: 80, unit: "inr" },
        ],
      },
      {
        bindingId: "period_trend",
        metricIds: ["sales.period_total"],
        title: "Trend",
        points: [{ label: "Jul", value: 100, unit: "inr" }],
      },
    ],
    links: [{ label: "Overdue", href: "/billing?filter=overdue" }],
    warnings: [],
    omittedNotes: [],
    narrativeHints: ["Period: Jul 2026 (calendar_month)"],
  });
}

describe("director commercial acceptance (unit)", () => {
  it("CD1–CD2: month ask routes; attentions ≤3 with overflow; empty OK", () => {
    expect(recipeMatchesQuery("How is July going?")).toBe("month_performance");
    expect(recipeMatchesQuery("How is this month going?")).toBe("month_performance");
    expect(recipeMatchesQuery("Director brief for this month")).toBe("month_performance");

    const padded = monthPack({ attentions: 5 });
    expect(padded.attentions.primary).toHaveLength(NOVA_MONTH_ATTENTION_PRIMARY_MAX);
    expect(padded.attentions.overflowCount).toBe(2);
    expect(monthPack({ attentions: 0 }).attentions.primary).toHaveLength(0);
  });

  it("CD5–CD10: period explicit; certified Month metrics; thin charts only", () => {
    const pack = monthPack({ attentions: 2 });
    expect(pack.period.calendarKind).toBe("calendar_month");
    expect(pack.period.label).toMatch(/Jul/);
    expect(listCertifiedMonthBindings().length).toBeGreaterThan(0);
    expect(listDraftProjectBindings().every((b) => b.certification === "draft")).toBe(true);
    expect(listDraftCollectionBindings().every((b) => b.certification === "draft")).toBe(true);
    for (const c of pack.charts) {
      expect(["kpi_strip", "period_trend", "ageing_or_attention"]).toContain(c.bindingId);
    }
    expect(pack.links.length).toBeGreaterThan(0);
  });

  it("CD12–CD20: save path checksum + regenerate new id + revoke ACL", () => {
    const pack = monthPack();
    const sum = checksumNovaPack(pack);
    const envelope = buildNovaReportSecurityEnvelope({
      tenantId: "default",
      ownerUserId: "u1",
      packId: pack.packId,
      packVersion: pack.packVersion,
      packSchemaVersion: 1,
      metricVersions: { "sales.period_total": "1" },
      sensitivity: "standard",
      permissionsUsed: ["ai.assistant.read", "invoice.read"],
      dataAsOf: pack.dataAsOf,
      expiresAt: defaultNovaReportExpiresAt(),
      checksum: sum,
      objectKeys: ["nova/reports/default/u1/r1/snapshot.json"],
    });
    const text = renderNovaReportText({
      title: "July",
      narrative: pack.narrativeHints[0] ?? "ok",
      pack,
      envelope,
    });
    expect(text).toMatch(/calendar_month/);
    expect(text).toMatch(/Metrics:/);
    expect(text).toMatch(/immutable/i);

    const pdf = renderNovaReportPdf({
      reportId: "r1",
      title: "July",
      narrative: "ok",
      pack,
      envelope,
    });
    expect(pdf.stub).toBe(false);
    const pdfLatin = Buffer.from(pdf.bytes).toString("latin1");
    expect(pdfLatin.startsWith("%PDF")).toBe(true);
    expect(pdfLatin).toMatch(/Metrics/);

    const regen = planRegeneratedNovaReportId({
      previousReportId: "rep_old",
      nextId: () => "rep_new",
    });
    expect(regen.newReportId).not.toBe(regen.regeneratedFromId);

    const staff = {
      id: "u1",
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read"],
    } as never;
    expect(recheckNovaReportPermissions(staff, ["ai.assistant.read", "invoice.read"]).ok).toBe(
      false
    );
  });

  it("CD13–CD17: write-deny; no dashboard builder; deny_write family", () => {
    // Imperative please-create / approve / delete stay write-deny; bare create+module → howto.
    expect(isNovaWriteMutationQuery("please create this invoice")).toBe(true);
    expect(isNovaWriteMutationQuery("Create an invoice for Tata")).toBe(false);
    expect(preflightNovaWriteDeny("Approve this payment")?.toolsUsed).toContain("read_only_guard");
    expect(runNovaSearchEngine("delete this purchase bill").queryFamily).toBe("deny_write");
    expect(NOVA_INVARIANTS.foreverForbidden).toContain("dashboard_builder");
    expect(NOVA_INVARIANTS.foreverForbidden).toContain("erp_writeback");
    expect(NOVA_INVARIANTS.neverWriteOperationalErp).toBe(true);
  });

  it("P4–P5: Project Command + Collection Attention signature asks", () => {
    expect(recipeMatchesQuery("tell me everything important about this project")).toBe(
      "project_command"
    );
    expect(recipeMatchesQuery("collection attention for Tata")).toBe("collection_attention");
    expect(recipeMatchesQuery("collection risk score for Avaada")).toBe("collection_attention");
  });
});
