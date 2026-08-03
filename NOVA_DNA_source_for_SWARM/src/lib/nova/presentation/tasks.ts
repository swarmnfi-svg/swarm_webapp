/**
 * PREP — Polished tasks_summary formatter (hybrid_guarded fallback).
 * Counts and sample tasks from facts only; bullet lists, not semicolon packs.
 */

import {
  polishBullet,
  polishCount,
  polishJoin,
  polishSection,
  polishTitle,
} from "@/lib/nova/presentation/layout";

export type TasksSummaryFact = {
  message?: unknown;
  openCount?: unknown;
  overdueCount?: unknown;
  dueSoonCount?: unknown;
  completedCount?: unknown;
  completedPeriod?: unknown;
  subject?: { name?: string; relation?: string };
  entityFilter?: unknown;
  projectScoped?: unknown;
  customerScoped?: unknown;
  completedByAssignee?: Array<{
    name?: string;
    staffCode?: string | null;
    completedCount?: number;
  }>;
  samples?: TaskSample[];
  overdueSamples?: TaskSample[];
};

type TaskSample = {
  no?: string;
  title?: string;
  status?: string;
  priority?: string;
  due?: string | null;
  overdue?: boolean;
  assigneeNames?: string[];
  project?: { name?: string; id?: string } | null;
};

function tasksScopeTitleSuffix(d: TasksSummaryFact): string | undefined {
  const label =
    d.entityFilter != null && String(d.entityFilter).trim()
      ? String(d.entityFilter).trim().replace(/\s+/g, " ")
      : "";
  if (d.customerScoped && label) return `customer ${label}`;
  if (d.projectScoped && label) return `project ${label}`;
  if (d.subject?.relation === "other" && d.subject.name) return d.subject.name;
  return undefined;
}

export function formatTasksSummaryPolished(d: TasksSummaryFact): string {
  const scopeSuffix = tasksScopeTitleSuffix(d);
  const open = polishCount(d.openCount);
  const overdue = polishCount(d.overdueCount);

  const lines: string[] = [polishTitle("Tasks summary", scopeSuffix)];

  if (d.message) {
    lines.push("", String(d.message));
  }

  if (open === 0 && overdue === 0 && !d.message) {
    lines.push("", "Nothing open or overdue in scope.");
    return polishJoin(lines);
  }

  if (!(open === 0 && overdue === 0 && d.message)) {
    lines.push("", "Current task load:");
    lines.push("", polishBullet(`**${open}** open`));
    lines.push(polishBullet(`**${overdue}** overdue`));
    if (d.dueSoonCount != null) {
      lines.push(polishBullet(`**${polishCount(d.dueSoonCount)}** due within 7 days`));
    }
    if (d.completedCount != null) {
      const period =
        d.completedPeriod != null ? ` (${String(d.completedPeriod)})` : "";
      lines.push(
        polishBullet(`**${polishCount(d.completedCount)}** completed${period}`)
      );
    }
  }

  // One scope caption only — never both customer + project claims.
  const label =
    d.entityFilter != null && String(d.entityFilter).trim()
      ? String(d.entityFilter).trim().replace(/\s+/g, " ")
      : "";
  if (d.customerScoped && label) {
    lines.push(
      "",
      polishBullet(`Filtered to customer **${label}** (across their projects).`)
    );
  } else if (d.projectScoped && label) {
    lines.push(
      "",
      polishBullet(
        `Scoped to project **${label}** — counts are project-filtered (not org-wide).`
      )
    );
  }

  const completers = d.completedByAssignee ?? [];
  if (completers.length) {
    lines.push("", polishSection("Top completers"));
    for (const c of completers.slice(0, 5)) {
      lines.push(
        polishBullet(
          `${c.name ?? "Unknown"}${c.staffCode ? ` (${c.staffCode})` : ""} — ${c.completedCount ?? 0}`
        )
      );
    }
  }

  const samples = d.samples ?? d.overdueSamples ?? [];
  if (samples.length) {
    lines.push("", polishSection(overdue > 0 ? "Attention tasks" : "Open tasks"));
    for (const t of samples.slice(0, 5)) {
      const who =
        t.assigneeNames && t.assigneeNames.length > 0
          ? t.assigneeNames.join(", ")
          : "unassigned";
      const bits = [
        t.no,
        t.title,
        who,
        t.status,
        t.priority,
        t.due ? `due ${t.due}` : null,
        t.overdue ? "OVERDUE" : null,
        t.project?.name ?? null,
      ].filter(Boolean);
      lines.push(polishBullet(bits.join(" · ")));
    }
  }

  return polishJoin(lines);
}
