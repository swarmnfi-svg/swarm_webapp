/**
 * NOVA Trend engine — bind domain → load adapter → format.
 */
import {
  NOVA_TREND_SCHEMA_VERSION,
  type NovaTrendBundle,
  type NovaTrendResult,
} from "@/lib/nova/trend/contract";
import { inferNovaTrendDomain } from "@/lib/nova/trend/domain";
import { formatNovaTrendDeterministic } from "@/lib/nova/trend/format";
import { loadAttendanceLateTrend } from "@/lib/nova/trend/adapters/attendance-late";
import { loadArAgingTrend } from "@/lib/nova/trend/adapters/ar-aging";
import { loadKpiScoreTrend } from "@/lib/nova/trend/adapters/kpi-score";
import { loadStaffExpenseSpendTrend } from "@/lib/nova/trend/adapters/staff-expense-spend";
import { loadTaskLateCompletionTrend } from "@/lib/nova/trend/adapters/task-late-completion";
import { bindNovaTrendWindow, inferNovaTrendGrain } from "@/lib/nova/trend/window";
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";

export type NovaTrendEngineOutcome =
  | { kind: "ok"; result: NovaTrendResult }
  | { kind: "denied"; error: string }
  | { kind: "empty"; result: NovaTrendResult };

function plannedBundle(
  domain: NovaTrendBundle["domain"],
  ctx: NovaSkillHandlerContext,
  message: string
): NovaTrendResult {
  const window = bindNovaTrendWindow(ctx.query, { range: ctx.range, tz: ctx.tz });
  const grain = inferNovaTrendGrain(window.from, window.to);
  const bundle: NovaTrendBundle = {
    schemaVersion: NOVA_TREND_SCHEMA_VERSION,
    domain,
    entity: { kind: "org", label: "Organisation" },
    metric: { id: "planned", label: "Planned", unit: "n/a" },
    window,
    grain,
    series: [],
    rankings: [],
    empty: true,
    message,
    links: [{ title: "AI Assistant", href: "/ai-assistant" }],
  };
  return formatNovaTrendDeterministic(bundle);
}

export async function runNovaTrend(
  ctx: NovaSkillHandlerContext
): Promise<NovaTrendEngineOutcome> {
  const { domain } = inferNovaTrendDomain(ctx.query);

  if (domain === "generic") {
    return {
      kind: "empty",
      result: plannedBundle(
        "generic",
        ctx,
        'Say e.g. “late comers trend”, “KPI trend for Amit”, “who has high KPI for a long streak”, “AR aging trend”, or “who completes tasks after overdue most often”.'
      ),
    };
  }

  const loaded =
    domain === "task_late_completion"
      ? await loadTaskLateCompletionTrend(ctx)
      : domain === "ar_aging"
        ? await loadArAgingTrend(ctx)
        : domain === "staff_expense_spend"
          ? await loadStaffExpenseSpendTrend(ctx)
          : domain === "kpi_score"
            ? await loadKpiScoreTrend(ctx)
            : await loadAttendanceLateTrend(ctx);

  if (!loaded.ok) {
    if ("denied" in loaded && loaded.denied) {
      return { kind: "denied", error: loaded.error };
    }
    if ("bundle" in loaded) {
      return { kind: "empty", result: formatNovaTrendDeterministic(loaded.bundle) };
    }
  }

  if (loaded.ok) {
    return { kind: "ok", result: formatNovaTrendDeterministic(loaded.bundle) };
  }

  return {
    kind: "empty",
    result: plannedBundle(domain, ctx, "Nothing to chart."),
  };
}
