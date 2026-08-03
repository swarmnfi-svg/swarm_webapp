/**
 * Party bind → tasks_summary where + caption flags.
 * Customer parent bind must never emit project-scoped Avaada trust copy.
 */

export function normalizeEntityFilterLabel(name?: string | null): string | null {
  const t = (name ?? "").trim().replace(/\s+/g, " ");
  return t || null;
}

export type TasksPartyScopeKind = "project" | "customer" | "soft" | "none";

export type TasksPartyScopeResult = {
  kind: TasksPartyScopeKind;
  /** Prisma where fragment merged into task queries (null = no party filter). */
  where: Record<string, unknown> | null;
  projectScoped: boolean;
  customerScoped: boolean;
  label: string | null;
};

type TaskTextSearchFn = (hint: string) => Record<string, unknown>;

/**
 * Bound project → projectId. Bound customer → that customer's projects.
 * Soft name (no bind) may still filter by project name / task text — but does
 * **not** claim projectScoped (reserve that flag + Avaada trust copy for true project bind).
 */
export function buildTasksPartyScope(opts: {
  resolvedEntityType: "customer" | "vendor" | "project" | null;
  resolvedEntityDbId: string | null;
  entityFilterName?: string | null;
  taskTextSearch: TaskTextSearchFn;
}): TasksPartyScopeResult {
  const label = normalizeEntityFilterLabel(opts.entityFilterName);

  if (opts.resolvedEntityDbId && opts.resolvedEntityType === "project") {
    return {
      kind: "project",
      where: { projectId: opts.resolvedEntityDbId },
      projectScoped: true,
      customerScoped: false,
      label,
    };
  }

  if (opts.resolvedEntityDbId && opts.resolvedEntityType === "customer") {
    return {
      kind: "customer",
      where: { project: { customerId: opts.resolvedEntityDbId } },
      projectScoped: false,
      customerScoped: true,
      label,
    };
  }

  if (label) {
    return {
      kind: "soft",
      where: {
        OR: [
          {
            project: {
              OR: [
                {
                  projectName: {
                    contains: label,
                    mode: "insensitive" as const,
                  },
                },
                {
                  projectId: {
                    contains: label,
                    mode: "insensitive" as const,
                  },
                },
              ],
            },
          },
          opts.taskTextSearch(label),
        ],
      },
      projectScoped: false,
      customerScoped: false,
      label,
    };
  }

  return {
    kind: "none",
    where: null,
    projectScoped: false,
    customerScoped: false,
    label: null,
  };
}

const DEFAULT_SAMPLE_NOTE =
  "Each sample includes assignees (name + staff code), status, priority, due date, overdue flag, project, requester, and owner when present. Always name assignees from this data — never say assignees are missing if assigneeNames is non-empty. For 'who completed more', use completedByAssignee.";

/**
 * Narration / LLM note — mutually exclusive customer vs project copy.
 */
export function buildTasksPartyScopeNote(opts: {
  subjectRelation?: "self" | "other";
  subjectName?: string;
  projectScoped: boolean;
  customerScoped: boolean;
  label: string | null;
}): string {
  if (opts.subjectRelation === "other" && opts.subjectName) {
    const who = opts.subjectName.trim();
    return `These tasks are for ${who} (not the session user). Speak about ${who} in third person. Never address the session user as ${who}. Always name assignees from sample data.`;
  }
  if (opts.projectScoped && opts.label) {
    return `These tasks are scoped to project “${opts.label}”. Counts and samples are project-filtered — never report org-wide totals.`;
  }
  if (opts.customerScoped && opts.label) {
    return `These tasks are for customer “${opts.label}” across their projects. Counts and samples are customer-filtered.`;
  }
  return DEFAULT_SAMPLE_NOTE;
}
