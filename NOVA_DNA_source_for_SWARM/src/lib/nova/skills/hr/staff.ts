/**
 * HR skill — staff_summary (directory + named staff profile lookup).
 * Report-intent directory asks return a savable staff_directory_report pack.
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

export async function runStaffSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, sampleLimit } = ctx;
  const name = "staff_summary";
  const links: NovaToolLink[] = [];

  if (!can(user, "staff.read") && !can(user, "hr.employee.read")) {
    return {
      fact: { tool: name, ok: false, denied: true, error: "Missing staff.read" },
    };
  }

  const personHint =
    ctx.personHint?.trim() ||
    ctx.entityFilterName?.trim() ||
    ctx.entityHint?.trim() ||
    null;

  // “staff Arif” → profile lookup (RBAC already gated), not sticky money party resolve.
  if (personHint && personHint.length >= 2) {
    const matches = await prisma.staffProfile.findMany({
      where: {
        OR: [
          { fullName: { contains: personHint, mode: "insensitive" } },
          { staffCode: { equals: personHint, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        staffCode: true,
        fullName: true,
        department: true,
        designation: true,
        employmentStatus: true,
        userId: true,
      },
      take: 8,
    });
    const exact =
      matches.find((s) => s.fullName.toLowerCase() === personHint.toLowerCase()) ??
      matches.find((s) => s.staffCode?.toLowerCase() === personHint.toLowerCase()) ??
      (matches.length === 1 ? matches[0] : null);

    links.push({ title: "Staff", href: "/staff" });

    if (!exact && matches.length > 1) {
      return {
        fact: {
          tool: name,
          ok: true,
          data: withFactProvenance(
            {
              mode: "ambiguous",
              queryName: personHint,
              matchCount: matches.length,
              candidates: matches.slice(0, 5).map((s) => ({
                code: s.staffCode,
                name: s.fullName,
                department: s.department,
                designation: s.designation,
              })),
              message: `Multiple staff match “${personHint}” — reply with a staff code or full name.`,
            },
            { sources: ["staff_master"] }
          ),
        },
        links,
      };
    }

    if (!exact) {
      return {
        fact: {
          tool: name,
          ok: true,
          data: withFactProvenance(
            {
              mode: "not_found",
              queryName: personHint,
              matchCount: 0,
              message: `No staff member matching “${personHint}” was found.`,
            },
            { sources: ["staff_master"] }
          ),
        },
        links,
      };
    }

    return {
      fact: {
        tool: name,
        ok: true,
        data: withFactProvenance(
          {
            mode: "profile",
            queryName: personHint,
            staff: {
              code: exact.staffCode,
              name: exact.fullName,
              department: exact.department,
              designation: exact.designation,
              status: exact.employmentStatus,
            },
          },
          { sources: ["staff_master"] }
        ),
      },
      links,
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const sampleTake = reportIntent ? rowCap : (sampleLimit ?? 8);

  const [activeCount, totalCount, byDept, recent] = await Promise.all([
    prisma.staffProfile.count({ where: { employmentStatus: "ACTIVE" } }),
    prisma.staffProfile.count(),
    prisma.staffProfile.groupBy({
      by: ["department"],
      where: { employmentStatus: "ACTIVE" },
      _count: true,
    }),
    prisma.staffProfile.findMany({
      where: { employmentStatus: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: sampleTake,
      select: {
        staffCode: true,
        fullName: true,
        department: true,
        designation: true,
      },
    }),
  ]);

  links.push({ title: "Staff", href: "/staff" });

  const byDepartment = byDept
    .map((g) => ({ department: g.department || "Unassigned", count: g._count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const sampleStaff = recent.map((s) => ({
    code: s.staffCode,
    name: s.fullName,
    department: s.department,
    designation: s.designation,
  }));

  const data = withFactProvenance(
    {
      mode: "directory",
      activeCount,
      totalCount,
      byDepartment,
      sampleStaff,
    },
    { sources: ["staff_master"] }
  );

  if (reportIntent) {
    const { attachment } = buildSkillReportPack({
      packId: "staff_directory_report",
      reportMode,
      title: "Staff directory report",
      headline: `${activeCount} active of ${totalCount} staff · ${byDepartment.length} department group(s)`,
      period: {
        label: "point in time",
        grain: "open",
        calendarKind: "point_in_time",
        source: "default",
      },
      metrics: [
        {
          metricId: "staff.active_count",
          version: "1",
          certification: "draft",
          value: activeCount,
          display: `${activeCount} active`,
        },
        {
          metricId: "staff.total_count",
          version: "1",
          certification: "draft",
          value: totalCount,
          display: `${totalCount} total`,
        },
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["staff.active_count"],
          title: "Active staff by department",
          points: byDepartment.slice(0, 8).map((d) => ({
            label: String(d.department).slice(0, 18),
            value: d.count,
            unit: "count",
          })),
        },
      ],
      tables: [
        {
          id: "staff_directory_rows",
          title: "Active staff sample",
          columns: ["Code", "Name", "Department", "Designation"],
          rows: sampleStaff.map((s) => [
            reportCell(s.code),
            reportCell(s.name),
            reportCell(s.department),
            reportCell(s.designation),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: ["Active employmentStatus only in sample. Named profile lookups stay chat-only."],
    });
    return {
      fact: {
        tool: name,
        ok: true,
        data: withSkillReportAttachment(data as Record<string, unknown>, attachment),
      },
      links,
    };
  }

  return {
    fact: {
      tool: name,
      ok: true,
      data,
    },
    links,
  };
}
