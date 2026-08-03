/**
 * PREP — Polished receipts_summary formatter (hybrid_guarded fallback).
 * Collections wording; money only from *Inr fact fields.
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

export type ReceiptsSummaryFact = {
  period?: unknown;
  receiptCount?: unknown;
  totalCollectedInr?: unknown;
  sampleReceipts?: Array<{
    number?: string;
    date?: string;
    customer?: string;
    amountInr?: string;
    mode?: string;
    project?: string;
  }>;
  amountMatches?: Array<{
    number?: string;
    date?: string;
    customer?: string;
    amountInr?: string;
  }>;
};

export function formatReceiptsSummaryPolished(d: ReceiptsSummaryFact): string {
  const count = polishCount(d.receiptCount);
  const period = d.period != null ? String(d.period) : undefined;

  if (count === 0) {
    return polishJoin([
      polishTitle("Collections summary", period),
      "",
      "No receipts recorded for this period.",
    ]);
  }

  const lines: string[] = [
    polishTitle("Collections summary", period),
    "",
    "Receipts recorded for this period:",
    "",
    polishBullet(
      `**${polishMoney(d.totalCollectedInr)}** collected from **${count}** receipt(s)`
    ),
  ];

  const samples = d.sampleReceipts ?? [];
  if (samples.length) {
    lines.push("", polishSection("Recent receipts"));
    for (const s of samples.slice(0, 12)) {
      lines.push(
        polishBullet(
          `${s.number ?? "—"} — ${s.customer ?? "—"} — ${polishMoney(s.amountInr)}` +
            (s.date ? ` — ${s.date}` : "") +
            (s.mode ? ` — ${s.mode}` : "") +
            (s.project ? ` · ${s.project}` : "")
        )
      );
    }
    const cap = polishSampleCapNote(samples.length, count, "receipts");
    if (cap) lines.push("", cap);
  }

  const matches = d.amountMatches ?? [];
  if (matches.length) {
    lines.push("", polishSection("Amount matches"));
    lines.push("_May be outside the period above:_");
    for (const s of matches.slice(0, 5)) {
      lines.push(
        polishBullet(
          `${s.number ?? "—"} — ${s.customer ?? "—"} — ${polishMoney(s.amountInr)} — ${s.date ?? "—"}`
        )
      );
    }
  }

  return polishJoin(lines);
}
