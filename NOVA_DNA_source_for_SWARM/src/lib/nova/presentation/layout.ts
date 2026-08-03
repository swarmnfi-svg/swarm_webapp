/**
 * Shared layout helpers for deterministic_polished formatters.
 * Facts stay exact — these only rearrange wording into cards/bullets.
 */

export function polishTitle(title: string, period?: unknown): string {
  const p = period != null && String(period).trim() ? ` — ${String(period).trim()}` : "";
  return `## ${title}${p}`;
}

export function polishSection(heading: string): string {
  return `### ${heading}`;
}

export function polishBullet(text: string): string {
  return `* ${text}`;
}

export function polishMetricLine(label: string, value: string | number): string {
  return polishBullet(`**${value}** ${label}`);
}

export function polishNote(text: string): string {
  return `> ${text}`;
}

export function polishJoin(lines: Array<string | null | undefined | false>): string {
  return lines.filter((l): l is string => typeof l === "string" && l.length > 0).join("\n");
}

/** Prefer preformatted *Inr fields; never invent money. */
export function polishMoney(value: unknown, fallback = "—"): string {
  if (value == null || value === "") return fallback;
  return String(value);
}

export function polishCount(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Humanize ERP tokens for user-facing copy (shared with attendance polish). */
export { formatNovaScopeLabel as polishScopeLabel } from "@/lib/ai/nova-presentation";

export function polishSampleCapNote(showing: number, total: number, noun: string): string | null {
  if (showing <= 0 || total <= showing) return null;
  return polishNote(`Showing ${showing} of ${total} ${noun} — totals above are complete.`);
}
