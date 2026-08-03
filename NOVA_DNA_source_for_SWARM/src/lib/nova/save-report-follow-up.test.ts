/**
 * save/give report follow-up vs ERP reports_snapshot misroute.
 */
import { describe, expect, it } from "vitest";
import {
  isNovaSaveReportFollowUp,
  isNovaSaveablePackId,
  NOVA_SAVE_REPORT_CLARIFY,
  NOVA_SAVEABLE_PACK_IDS,
  recentSaveablePackFromDialog,
  withNovaSavablePackHint,
} from "@/lib/nova/save-report-follow-up";
import { runNovaSearchEngine } from "@/lib/nova/nova-search-engine";
import { selectToolsFromLexicon, matchNovaTopics } from "@/lib/ai/nova-lexicon";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { buildNovaPlan } from "@/lib/ai/nova-plan";
import {
  emptyNovaDialogState,
  setNovaLastSavablePack,
} from "@/lib/nova/dialog-state";
import { buildNovaPackResult, selectNovaPackAttentions } from "@/lib/nova/pack-result";
import { MONTH_PERFORMANCE_PACK_VERSION } from "@/lib/nova/packs/month-performance";

const SAVE_PHRASES = [
  "save report",
  "give report",
  "save this",
  "download report",
  "Save Report",
  "give me a report",
  "please save report",
  "save reprot", // typo
  "download this",
];

const NON_SAVE = [
  "sales register",
  "GSTR-1",
  "ar aging",
  "how is this month going",
  "FY 26-27 sales",
];

describe("isNovaSaveReportFollowUp", () => {
  it("matches save/give/download phrases and typos", () => {
    for (const q of SAVE_PHRASES) {
      expect(isNovaSaveReportFollowUp(q), q).toBe(true);
    }
  });

  it("does not match ERP register / pack asks", () => {
    for (const q of NON_SAVE) {
      expect(isNovaSaveReportFollowUp(q), q).toBe(false);
    }
  });
});

describe("SearchEngine + lexicon: save report ≠ reports_snapshot", () => {
  it("SearchEngine returns empty tools for save/give report", () => {
    for (const q of ["save report", "give report", "download report", "save this"]) {
      const slots = runNovaSearchEngine(q);
      expect(slots.tools, q).toEqual([]);
      expect(slots.tools, q).not.toContain("reports_snapshot");
      expect(slots.tools, q).not.toContain("gstr_snapshot");
      expect(slots.intent, q).toBe("save_nova_report");
      expect(slots.interpretedAs, q).toContain("save nova report");
    }
  });

  it("lexicon does not select reports_snapshot for save/give report", () => {
    for (const q of ["save report", "give report", "save this", "download report"]) {
      const { tools, topics } = selectToolsFromLexicon(q);
      expect(tools, q).not.toContain("reports_snapshot");
      expect(tools, q).not.toContain("gstr_snapshot");
      expect(topics.some((t) => t.id === "reports"), q).toBe(false);
      expect(selectNovaTools(q), q).not.toContain("reports_snapshot");
      expect(matchNovaTopics(q).some((t) => t.id === "reports"), q).toBe(false);
    }
  });

  it("buildNovaPlan does not attach reports_snapshot for give report", () => {
    const plan = buildNovaPlan("give report");
    expect(plan.tools).not.toContain("reports_snapshot");
    expect(plan.tools).not.toContain("gstr_snapshot");
  });

  it("sales register still maps to reports_snapshot", () => {
    expect(selectNovaTools("sales register")).toContain("reports_snapshot");
    expect(runNovaSearchEngine("sales register").tools).not.toContain("month_performance");
  });
});

describe("dialog lastSavablePack + clarify copy", () => {
  it("recentSaveablePackFromDialog returns pack within TTL", () => {
    const pack = buildNovaPackResult({
      packId: "month_performance",
      packVersion: MONTH_PERFORMANCE_PACK_VERSION,
      period: {
        label: "Jul 2026",
        grain: "month",
        calendarKind: "calendar_month",
        source: "explicit",
      },
      dataAsOf: "2026-07-13T00:00:00.000Z",
      metrics: [],
      facts: [],
      findings: [],
      attentions: selectNovaPackAttentions([]),
      charts: [],
      links: [],
      warnings: [],
      omittedNotes: [],
      narrativeHints: [],
    });
    const state = setNovaLastSavablePack(emptyNovaDialogState(), pack, "July brief");
    const recent = recentSaveablePackFromDialog(state);
    expect(recent?.pack.packId).toBe("month_performance");
    expect(recent?.narrative).toBe("July brief");
  });

  it("recentSaveablePackFromDialog ignores pack past TTL", () => {
    const pack = buildNovaPackResult({
      packId: "month_performance",
      packVersion: MONTH_PERFORMANCE_PACK_VERSION,
      period: {
        label: "Jul 2026",
        grain: "month",
        calendarKind: "calendar_month",
        source: "explicit",
      },
      dataAsOf: "2026-07-13T00:00:00.000Z",
      metrics: [],
      facts: [],
      findings: [],
      attentions: selectNovaPackAttentions([]),
      charts: [],
      links: [],
      warnings: [],
      omittedNotes: [],
      narrativeHints: [],
    });
    const state = setNovaLastSavablePack(
      emptyNovaDialogState(),
      pack,
      "July ₹ brief",
      { now: new Date("2026-07-13T10:00:00.000Z") }
    );
    expect(
      recentSaveablePackFromDialog(state, { now: new Date("2026-07-13T10:25:00.000Z") })
    ).toBeNull();
  });

  it("clarify copy points at savable packs", () => {
    expect(NOVA_SAVE_REPORT_CLARIFY).toMatch(/Month \/ Project \/ Collection \/ Attendance \/ Cash/i);
    expect(NOVA_SAVE_REPORT_CLARIFY).toMatch(/module PDF\/chart|receivables/i);
  });

  it("skill report pack ids are save-follow-up eligible", () => {
    for (const id of [
      "receivables_report",
      "receipts_report",
      "payment_requests_report",
      "sales_billing_report",
      "attendance_late_report",
      "staff_directory_report",
      "customers_report",
      "delivery_status_report",
      "gstr_report",
      "leave_report",
      "party_outstanding_report",
    ] as const) {
      expect(isNovaSaveablePackId(id), id).toBe(true);
      expect(NOVA_SAVEABLE_PACK_IDS).toContain(id);
    }
  });

  it("FY sales hint suggests savable month pack", () => {
    const hinted = withNovaSavablePackHint("**Sales** (FY 26-27): ₹1.", ["sales_summary"]);
    expect(hinted).toMatch(/How is this month going|receivables report/i);
    expect(withNovaSavablePackHint("pack done", ["month_performance", "sales_summary"])).not.toMatch(
      /savable director pack|savable pack ask/i
    );
  });
});
