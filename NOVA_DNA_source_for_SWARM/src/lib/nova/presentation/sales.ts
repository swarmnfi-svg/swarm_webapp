/**
 * PREP — Polished sales_summary formatter (hybrid_guarded fallback).
 * Uses only fact fields; never invents invoice counts or INR totals.
 */

import {
  polishBullet,
  polishCount,
  polishJoin,
  polishMoney,
  polishSampleCapNote,
  polishSection,
  polishTitle,
} from "@/lib/nova/presentation/layout";

export type SalesSummaryFact = {
  period?: unknown;
  invoiceCount?: unknown;
  sampleCount?: unknown;
  grandTotalInr?: unknown;
  taxableTotalInr?: unknown;
  gstTotalInr?: unknown;
  /** Skill field */
  sampleInvoices?: Array<{
    number?: string;
    customer?: string;
    amountInr?: string;
    date?: string;
  }>;
  /** Alias accepted by PREP goldens */
  samples?: Array<{
    number?: string;
    customer?: string;
    amountInr?: string;
    date?: string;
  }>;
};

export function formatSalesSummaryPolished(d: SalesSummaryFact): string {
  const count = polishCount(d.invoiceCount);
  const period = d.period != null ? String(d.period) : undefined;

  if (count === 0) {
    return polishJoin([
      polishTitle("Sales summary", period),
      "",
      "No tax invoices for this period.",
    ]);
  }

  const lines: string[] = [
    polishTitle("Sales summary", period),
    "",
    "Recorded tax invoices for this period:",
    "",
    polishBullet(`**${polishMoney(d.grandTotalInr)}** across **${count}** tax invoice(s)`),
  ];

  if (d.taxableTotalInr != null || d.gstTotalInr != null) {
    lines.push(
      polishBullet(
        `Taxable ${polishMoney(d.taxableTotalInr)} · GST ${polishMoney(d.gstTotalInr)}`
      )
    );
  }

  const samples = d.sampleInvoices ?? d.samples ?? [];
  if (samples.length) {
    lines.push("", polishSection("Sample invoices"));
    for (const s of samples.slice(0, 8)) {
      lines.push(
        polishBullet(
          `${s.number ?? "—"} — ${s.customer ?? "—"}${s.amountInr ? ` — ${s.amountInr}` : ""}${
            s.date ? ` — ${s.date}` : ""
          }`
        )
      );
    }
  }

  const sampleCount = polishCount(d.sampleCount ?? samples.length);
  const cap = polishSampleCapNote(sampleCount, count, "invoices");
  if (cap) lines.push("", cap);

  return polishJoin(lines);
}
