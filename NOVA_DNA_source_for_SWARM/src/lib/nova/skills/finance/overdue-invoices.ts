/**
 * Finance skill — overdue_invoices (extracted from nova-tools; behaviour identical).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { novaTodayStart } from "@/lib/ai/nova-dates";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

const n = (v: unknown) => Number(v ?? 0);

export async function runOverdueInvoices(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, tz, entityHint, entityFilterName } = ctx;
  const name = "overdue_invoices";
  const links: NovaToolLink[] = [];

  if (!can(user, "invoice.read") || !canViewOrgFinanceAggregates(user)) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing invoice.read and/or accounts/finance reports permission",
      },
    };
  }

  const today = novaTodayStart(new Date(), tz);
  const where = {
    OR: [
      { status: "OVERDUE" as const },
      { status: { in: ["SENT" as const, "PART_PAID" as const] }, dueDate: { lt: today } },
    ],
    ...(entityHint
      ? { customer: { customerName: { contains: entityFilterName, mode: "insensitive" as const } } }
      : {}),
  };
  const [count, rows] = await Promise.all([
    prisma.salesInvoice.count({ where }),
    prisma.salesInvoice.findMany({
      where,
      orderBy: { dueDate: "asc" },
      take: 8,
      select: {
        id: true,
        invoiceNumber: true,
        dueDate: true,
        grandTotal: true,
        status: true,
        customer: { select: { customerName: true } },
      },
    }),
  ]);

  for (const r of rows.slice(0, 5)) {
    links.push({ title: r.invoiceNumber, href: `/billing/${r.id}` });
  }
  links.push({ title: "Billing", href: "/billing" });

  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          count,
          entityFilter: entityFilterName ?? null,
          sampleCount: rows.length,
          samplesShowing: rows.length,
          samplesOf: count,
          samples: rows.map((r) => ({
            number: r.invoiceNumber,
            customer: r.customer.customerName,
            due: r.dueDate?.toISOString().slice(0, 10) ?? null,
            amountInr: inr(n(r.grandTotal)),
            status: r.status,
            href: `/billing/${r.id}`,
          })),
        },
        { sources: ["overdue_invoices"] }
      ),
    },
    links,
  };
}
