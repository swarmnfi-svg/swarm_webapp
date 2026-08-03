/**
 * Offline NOVA query-intelligence eval harness (P2 + recovery).
 * Fail when an entitySpan ask silently routes org-wide (no entity on SE slots).
 * Also locks ranking + person/task recoveries (QI-R* / QI-P*).
 * Wired into `release:verify` critical subset.
 *
 *   npx vitest run src/lib/nova/evals/query-intelligence-harness.test.ts
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runNovaSearchEngine } from "@/lib/nova/nova-search-engine";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { extractNovaPersonHint } from "@/lib/ai/nova-lexicon";
import {
  parseEntityModuleAsk,
  refuseSilentOrgWide,
  toolsImplyPartyScope,
  classifyQiAskOutcome,
  bumpQiMetric,
  emptyQiMetricCounters,
  qiWrongScopeRate,
  isNovaPersonTaskFallbackAsk,
  isNovaTaskCompletionRankingAsk,
} from "@/lib/nova/query-structure";

type Case = {
  id: string;
  query: string;
  expectEntity?: boolean;
  expectTools?: string[];
  forbidOrgWideScoped?: boolean;
  expectRanking?: boolean;
  forbidEntity?: boolean;
  expectStaffKind?: boolean;
  expectPersonHint?: boolean;
  expectPersonPath?: boolean;
  forbidPartyClarify?: boolean;
};

const FIXTURE = join(__dirname, "query-intelligence-goldens.jsonl");

function loadCases(): Case[] {
  const raw = readFileSync(FIXTURE, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => JSON.parse(l) as Case);
}

describe("NOVA QI offline harness", () => {
  const cases = loadCases();

  it("loads production-like goldens", () => {
    expect(cases.length).toBeGreaterThanOrEqual(15);
  });

  it("wrong-scope rate is 0 when gate would fire (party entitySpan asks)", () => {
    let counters = emptyQiMetricCounters();
    for (const c of cases.filter((x) => x.forbidOrgWideScoped)) {
      const structure = parseEntityModuleAsk(c.query);
      const slots = runNovaSearchEngine(c.query);
      const tools = selectNovaTools(c.query);
      const span = structure?.entitySpan ?? slots.entityHint;
      const refuse = refuseSilentOrgWide({
        entitySpan: span,
        tools,
        entityKindHint: structure?.entityKindHint ?? null,
      });
      const outcome = classifyQiAskOutcome({
        entitySpan: span,
        toolsImplyScope: toolsImplyPartyScope(tools),
        clarified: Boolean(refuse),
      });
      expect(outcome, c.id).not.toBe("wrong_scope");
      counters = bumpQiMetric(
        counters,
        outcome === "no_entity" ? "clarify_miss" : outcome
      );
    }
    expect(qiWrongScopeRate(counters)).toBe(0);
  });

  for (const c of cases) {
    it(`${c.id}: ${c.query}`, () => {
      const structure = parseEntityModuleAsk(c.query);
      const slots = runNovaSearchEngine(c.query);
      const tools = selectNovaTools(c.query);
      const person = extractNovaPersonHint(c.query);

      if (c.expectRanking) {
        expect(isNovaTaskCompletionRankingAsk(c.query), c.query).toBe(true);
        expect(slots.intent, c.query).toBe("task_completion_ranking");
        expect(slots.entityHint, c.query).toBeNull();
        expect(structure, c.query).toBeNull();
      }
      if (c.forbidEntity) {
        expect(slots.entityHint, c.query).toBeFalsy();
        expect(structure?.entitySpan, c.query).toBeFalsy();
      }
      if (c.expectStaffKind) {
        expect(structure?.entityKindHint, c.query).toBe("staff");
      }
      if (c.expectPersonHint) {
        expect(person, c.query).toBeTruthy();
      }
      if (c.expectPersonPath) {
        expect(isNovaPersonTaskFallbackAsk(c.query), c.query).toBe(true);
        expect(tools.some((t) => t === "tasks_summary") || slots.tools.includes("tasks_summary")).toBe(
          true
        );
      }
      if (c.expectEntity) {
        expect(slots.entityHint || structure?.entitySpan, c.query).toBeTruthy();
      }
      if (c.expectTools?.length) {
        expect(c.expectTools.some((t) => tools.includes(t) || slots.tools.includes(t))).toBe(
          true
        );
      }
      if (c.forbidPartyClarify) {
        expect(
          refuseSilentOrgWide({
            entitySpan: structure?.entitySpan,
            tools: ["tasks_summary"],
            personHint: person,
            entityKindHint: structure?.entityKindHint ?? null,
          }),
          c.query
        ).toBeNull();
      }
      if (c.forbidOrgWideScoped) {
        const span = structure?.entitySpan ?? slots.entityHint;
        expect(span, c.query).toBeTruthy();
        const scoped = ["tasks_summary", "project_command", "sales_summary", "nova_analysis"];
        const pickedScoped = tools.some((t) => scoped.includes(t));
        if (pickedScoped && span && structure?.entityKindHint !== "staff") {
          expect(
            refuseSilentOrgWide({
              entitySpan: span,
              tools,
              entityKindHint: structure?.entityKindHint ?? null,
            })?.clarify
          ).toBe(true);
          expect(slots.entityHint, c.query).toBeTruthy();
        }
      }
    });
  }
});
