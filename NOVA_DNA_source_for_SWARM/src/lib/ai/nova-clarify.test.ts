import { describe, expect, it } from "vitest";
import {
  buildCatalogNearMissClarifyCard,
  buildEntityClarifyCard,
  buildEntityMetricClarifyCard,
  buildGenericMetricClarifyCard,
  buildMetricClarifyCard,
  buildPendingClarifyCard,
  buildPeriodClarifyCard,
  formatNovaClarifyCard,
  matchNovaClarifySelection,
  novaClarifyAnswerPayload,
  novaClarifyPayloadFromReason,
  parseNovaClarifyOptionsFromAssistant,
  looksLikeNovaClarifyReply,
} from "@/lib/ai/nova-clarify";
import { novaConfirmChipsToSuggestions } from "@/lib/ai/nova-suggest";
import { novaAmbiguityClarification } from "@/lib/ai/nova-dates";

describe("nova-clarify cards", () => {
  it("catalog near-miss formats as numbered Did-you-mean chips", () => {
    const card = buildCatalogNearMissClarifyCard("leave balans", [
      { id: "leave", label: "leave balance" },
      { id: "leave2", label: "my leave balance" },
    ]);
    const text = formatNovaClarifyCard(card);
    expect(text).toMatch(/Did you mean/i);
    expect(text).toMatch(/1\.\s+\*\*leave balance\*\*/);
    expect(matchNovaClarifySelection("1", card.options)?.label).toBe("leave balance");
    expect(matchNovaClarifySelection("leave balance", card.options)?.reply).toBe("leave balance");
  });

  it("formats entity options as numbered Did-you-mean list", () => {
    const card = buildEntityClarifyCard("Acme", [
      { id: "1", label: "Acme Solar", type: "customer", code: "C001" },
      { id: "2", label: "Acme Power", type: "customer", code: "C002" },
      { id: "3", label: "Acme Plant", type: "project", code: "P001" },
    ]);
    const text = formatNovaClarifyCard(card);
    expect(text).toMatch(/Did you mean/i);
    expect(text).toMatch(/1\.\s+\*\*Acme Solar\*\*/);
    expect(text).toMatch(/customer · C001/);
    expect(text).toMatch(/3\.\s+\*\*Acme Plant\*\*/);
    expect(text).toMatch(/Reply with the number/i);
  });

  it("parses numbered options and matches 1 / label / code", () => {
    const text = formatNovaClarifyCard(
      buildEntityClarifyCard("Acme", [
        { id: "1", label: "Acme Solar", type: "customer", code: "C001" },
        { id: "2", label: "Acme Power", type: "vendor", code: "V002" },
      ])
    );
    const opts = parseNovaClarifyOptionsFromAssistant(text);
    expect(opts).toHaveLength(2);
    expect(matchNovaClarifySelection("1", opts)?.label).toBe("Acme Solar");
    expect(matchNovaClarifySelection("Acme Power", opts)?.code).toBe("V002");
    expect(matchNovaClarifySelection("C001", opts)?.label).toBe("Acme Solar");
    expect(looksLikeNovaClarifyReply("1", text)).toBe(true);
  });

  it("generic metric clarify lists actionable chips", () => {
    const text = formatNovaClarifyCard(buildGenericMetricClarifyCard("stuff"));
    expect(text).toMatch(/not sure/i);
    expect(text).toMatch(/1\.\s+\*\*sales\*\*/);
    expect(text).toMatch(/receipts|late comers|tasks/i);
  });

  it("metric confirm chips are numbered selectable payload", () => {
    const payload = novaClarifyAnswerPayload(buildMetricClarifyCard("today"));
    expect(payload.clarifyKind).toBe("metric");
    expect(payload.options.map((o) => o.label)).toEqual([
      "sales",
      "receipts",
      "late comers",
      "tasks",
      "deliveries",
      "payment requests",
      "expenses",
      "salary",
    ]);
    expect(payload.answer).toMatch(/1\.\s+\*\*sales\*\*/);
    expect(payload.answer).toMatch(/which metric/i);
    expect(payload.answer).not.toMatch(/which metric — \*\*sales\*\*/);
    expect(matchNovaClarifySelection("receipts", payload.options)?.reply).toBe("receipts");
    expect(matchNovaClarifySelection("2", payload.options)?.label).toBe("receipts");
  });

  it("period confirm chips prefer today / this week / this month", () => {
    const payload = novaClarifyAnswerPayload(buildPeriodClarifyCard("late comers"));
    expect(payload.clarifyKind).toBe("period");
    expect(payload.options.map((o) => o.label)).toEqual(["today", "this week", "this month"]);
    expect(payload.answer).toMatch(/1\.\s+\*\*today\*\*/);
    expect(looksLikeNovaClarifyReply("this week", payload.answer)).toBe(true);
  });

  it("pending clarify uses queue chips", () => {
    const payload = novaClarifyAnswerPayload(buildPendingClarifyCard());
    expect(payload.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["approvals", "leave", "tasks", "payment requests"])
    );
    expect(payload.answer).toMatch(/Pending what/i);
    expect(payload.answer).toMatch(/1\.\s+\*\*approvals\*\*/);
  });

  it("entity metric clarify chips avoid silent money default", () => {
    const payload = novaClarifyAnswerPayload(buildEntityMetricClarifyCard("Acme"));
    expect(payload.clarifyKind).toBe("metric");
    expect(payload.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["sales", "receipts", "outstanding", "customer / project record"])
    );
  });

  it("ambiguity clarification emits numbered metric chips for bare today", () => {
    const text = novaAmbiguityClarification(
      "today",
      new Date("2026-07-11T09:00:00+05:30"),
      "Asia/Kolkata"
    );
    expect(text).toBeTruthy();
    const fromReason = novaClarifyPayloadFromReason(text!);
    expect(fromReason?.options.length).toBeGreaterThanOrEqual(6);
    expect(fromReason?.options.some((o) => o.label === "sales")).toBe(true);
    expect(fromReason?.options.some((o) => o.label === "deliveries")).toBe(true);
    expect(text).toMatch(/1\.\s+\*\*sales\*\*/);
  });

  it("suggest mapper turns confirm chips into prompt suggestions", () => {
    const payload = novaClarifyAnswerPayload(buildPeriodClarifyCard("attendance"));
    const chips = novaConfirmChipsToSuggestions(payload.options);
    expect(chips).toEqual([
      { prompt: "today", label: "today" },
      { prompt: "this week", label: "this week" },
      { prompt: "this month", label: "this month" },
    ]);
  });

  it("upgrades legacy prose clarify into numbered chips", () => {
    const prose =
      "For **today**, which metric — **sales**, **receipts**, **late comers**, or **tasks**?";
    const upgraded = novaClarifyPayloadFromReason(prose);
    expect(upgraded?.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(["sales", "receipts", "late comers", "tasks"])
    );
    expect(upgraded?.answer).toMatch(/1\.\s+\*\*sales\*\*/);
  });
});
