/**
 * Polished customers_summary formatter (deterministic_polished).
 * Master headcount + recent rows from facts only — never invents AR.
 */

import {
  polishBullet,
  polishCount,
  polishJoin,
  polishNote,
  polishSection,
  polishTitle,
} from "@/lib/nova/presentation/layout";

export type CustomersSummaryFact = {
  activeCount?: unknown;
  totalCount?: unknown;
  entityFilter?: unknown;
  recentCustomers?: Array<{
    id?: string;
    name?: string;
    company?: string | null;
    state?: string | null;
    active?: boolean;
  }>;
};

export function formatCustomersSummaryPolished(d: CustomersSummaryFact): string {
  const active = polishCount(d.activeCount);
  const total = polishCount(d.totalCount);
  const filter =
    d.entityFilter != null && String(d.entityFilter).trim()
      ? String(d.entityFilter).trim()
      : undefined;

  const lines: string[] = [
    polishTitle("Customers", filter),
    "",
    polishBullet(`**${active}** active / **${total}** total in master`),
  ];

  if (total === 0) {
    lines.push("", polishNote("No customers match this filter."));
    return polishJoin(lines);
  }

  const recent = d.recentCustomers ?? [];
  if (recent.length) {
    lines.push("", polishSection("Recent in master"));
    for (const c of recent.slice(0, 6)) {
      const bits = [
        c.name ?? "—",
        c.id ? `(${c.id})` : null,
        c.company ? c.company : null,
        c.state ? c.state : null,
        c.active === false ? "inactive" : null,
      ].filter(Boolean);
      lines.push(polishBullet(bits.join(" · ")));
    }
  }

  return polishJoin(lines);
}
