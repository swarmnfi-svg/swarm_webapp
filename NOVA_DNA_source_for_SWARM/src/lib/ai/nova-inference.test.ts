import { describe, expect, it } from "vitest";
import { inferNovaQuery, isNovaNonReferentialName } from "@/lib/ai/nova-inference";
import { extractNovaPersonHint, extractNovaBareEntityCandidate } from "@/lib/ai/nova-lexicon";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { answerNovaQuery } from "@/lib/ai/nova";
import { resolveNovaFollowUp } from "@/lib/ai/nova-context";
import { buildNovaPlan, finalizeNovaPlan, shouldClarifyNovaPlan } from "@/lib/ai/nova-plan";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { llmPreservesLateStaffNames } from "@/lib/ai/nova-format";

const attendanceHist = [
  { role: "user" as const, content: "todays attendance" },
  {
    role: "assistant" as const,
    content: "6 late people. Data fetched from: attendance / late comers",
  },
];

const salesHist = [
  { role: "user" as const, content: "this month sales" },
  { role: "assistant" as const, content: "Sales total ₹1,00,000. tax invoice grand total." },
];

function admin() {
  return {
    id: "u1",
    name: "Arun C Michael",
    email: "a@b.com",
    role: "ADMIN",
    grantedPermissions: [
      "ai.assistant.read",
      "hr.attendance.team",
      "hr.attendance.read",
      "sales.read",
      "hr.leave.read",
      "hr.leave.create",
      "whatsapp.read",
      "portal.read",
      "automation.read",
      "links.read",
      "bank.sms.read",
      "vendorbank.read",
    ],
  } as never;
}

describe("Phase F / F2 nova-inference", () => {
  it("classifies ur capabilities as meta (never person / follow-up)", () => {
    const inf = inferNovaQuery("ur capabilities", attendanceHist);
    expect(inf.kind).toBe("meta");
    expect(inf.allowFollowUpMerge).toBe(false);
    expect(inf.allowNovaPlan).toBe(false);
    expect(extractNovaPersonHint("ur capabilities late")).toBeNull();
    expect(extractNovaBareEntityCandidate("ur capabilities")).toBeNull();
  });

  it("zero meta→person: known meta / stop phrases", () => {
    for (const q of [
      "ur capabilities",
      "ur features",
      "your features",
      "what modules do i have",
      "my permissions",
      "help",
      "what can you do",
    ]) {
      const inf = inferNovaQuery(q, attendanceHist);
      expect(inf.kind, q).toBe("meta");
      expect(inf.suppressPerson, q).toBe(true);
      expect(extractNovaPersonHint(q), q).toBeNull();
      expect(extractNovaBareEntityCandidate(q), q).toBeNull();
      expect(isNovaNonReferentialName(q), q).toBe(true);
    }
  });

  it("classifies who punched late as erp_query with person=null", () => {
    const inf = inferNovaQuery("who punched late", attendanceHist);
    expect(inf.kind).toBe("erp_query");
    expect(inf.allowNovaPlan).toBe(true);
    expect(extractNovaPersonHint(normalizeNovaQuery("who punched late"))).toBeNull();
    expect(extractNovaPersonHint("who punched late")).toBeNull();
    expect(selectNovaTools(normalizeNovaQuery("who punched late"))).toContain(
      "attendance_late_summary"
    );
  });

  it("topic-switch mid-thread → erp_query, no follow-up merge", () => {
    const inf = inferNovaQuery("what about leave?", salesHist);
    expect(inf.kind).toBe("erp_query");
    expect(inf.reason).toMatch(/topic_switch|erp_signal/);
    expect(inf.allowFollowUpMerge).toBe(false);
    expect(inf.moduleHint === "leave" || selectNovaTools(inf.query).includes("leave_summary")).toBe(
      true
    );
  });

  it("attendance bare-person follow-up → follow_up + merge person", () => {
    const inf = inferNovaQuery("Madhu", attendanceHist);
    expect(inf.kind).toBe("follow_up");
    expect(inf.allowFollowUpMerge).toBe(true);
    expect(inf.reason).toMatch(/attendance_person|short_or_pronoun/);
    const r = resolveNovaFollowUp("Madhu", attendanceHist);
    expect(r.isFollowUp).toBe(true);
    expect(r.plan?.person?.toLowerCase()).toBe("madhu");
    expect(r.forcedTools ?? r.plan?.tools).toContain("attendance_late_summary");
    expect(r.query.toLowerCase()).toMatch(/madhu/);
    expect(r.plan?.module).toBe("attendance");
  });

  it("classifies todays attendance as erp_query", () => {
    const inf = inferNovaQuery("todays attendance", []);
    expect(inf.kind).toBe("erp_query");
    expect(selectNovaTools(inf.query)).toContain("attendance_late_summary");
  });

  it("bare today clarifies via NovaPlan (not garbage)", () => {
    const inf = inferNovaQuery("today", []);
    expect(inf.kind).toBe("erp_query");
    expect(inf.reason).toBe("bare_period");
    expect(inf.allowNovaPlan).toBe(true);
    let plan = buildNovaPlan("today");
    plan = finalizeNovaPlan(plan, {});
    expect(shouldClarifyNovaPlan(plan)).toBe(true);
  });

  it("keeps real entity follow-up swaps (avaada after sales)", () => {
    const inf = inferNovaQuery("avaada", salesHist);
    expect(inf.kind).toBe("follow_up");
    expect(inf.allowFollowUpMerge).toBe(true);
    const r = resolveNovaFollowUp("avaada", salesHist);
    expect(r.isFollowUp).toBe(true);
    expect(r.forcedTools).toContain("sales_summary");
  });

  it("isNovaNonReferentialName covers WH and meta spans", () => {
    expect(isNovaNonReferentialName("who punched")).toBe(true);
    expect(isNovaNonReferentialName("ur capabilities")).toBe(true);
    expect(isNovaNonReferentialName("Madhu")).toBe(false);
    expect(isNovaNonReferentialName("Avaada")).toBe(false);
  });

  it("answerNovaQuery: ur capabilities → help even after attendance", async () => {
    const res = await answerNovaQuery(admin(), "ur capabilities", attendanceHist);
    expect(res.toolsUsed).toContain("help");
    expect(res.answer).not.toMatch(/staff member matching|late days/i);
  });

  it("answerNovaQuery: who punched late does not person-filter", async () => {
    const res = await answerNovaQuery(admin(), "who punched late", []);
    expect(res.toolsUsed).toContain("attendance_late_summary");
    expect(res.answer).not.toMatch(/matching ['"]who punched/i);
  });

  it("answerNovaQuery: topic switch leave after sales does not sticky sales", async () => {
    const res = await answerNovaQuery(admin(), "leave balance", salesHist);
    expect(res.toolsUsed).toContain("leave_summary");
    expect(res.toolsUsed).not.toContain("sales_summary");
  });
});

describe("Phase H open nav tools", () => {
  it.each([
    ["notifications", "notifications_open", "/notifications"],
    ["whatsapp", "whatsapp_open", "/whatsapp"],
    ["portal", "portal_open", "/portal"],
    ["automation", "automation_open", "/automation"],
    ["links", "links_open", "/links"],
    ["bank sms", "bank_sms_open", "/accounts/bank-sms"],
    ["bank details", "vendor_bank_open", "/vendors"],
  ] as const)("smoke %s → %s", async (q, tool, href) => {
    expect(extractNovaBareEntityCandidate(normalizeNovaQuery(q)), q).toBeNull();
    expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain(tool);
    const res = await answerNovaQuery(admin(), q);
    expect(res.toolsUsed, q).toContain(tool);
    expect(res.toolsUsed, q).not.toContain("lexicon_stub");
    expect(res.toolsUsed, q).not.toContain("clarify");
    expect(res.links?.some((l) => l.href === href || l.href.startsWith(href)), q).toBe(true);
  });
});

describe("llmPreservesLateStaffNames", () => {
  const dayFacts = [
    {
      tool: "attendance_late_summary",
      ok: true,
      data: {
        periodGrain: "day",
        focus: "late",
        mostLate: { name: "Arun C Michael" },
        topLateComers: [{ name: "Arun C Michael" }, { name: "MD Arif Ansari" }],
      },
    },
  ];

  it("rejects Madhu when not in late facts", () => {
    expect(
      llmPreservesLateStaffNames(
        "Madhu M punched in at 10:11 am; Arun C Michael punched in at 10:20 am.",
        dayFacts
      )
    ).toBe(false);
  });

  it("allows listed late staff including middle initials", () => {
    expect(
      llmPreservesLateStaffNames(
        "Arun C Michael punched in at 10:20 am (140 min late); MD Arif Ansari punched in at 8:33 am.",
        dayFacts
      )
    ).toBe(true);
  });
});
