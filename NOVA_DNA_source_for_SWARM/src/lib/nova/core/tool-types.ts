/**
 * Shared NOVA tool fact types — used by skills and `src/lib/ai/nova-tools`.
 */
import type { DateRange } from "@/lib/ai/nova-dates";

export type NovaToolLink = { title: string; href: string };

export type NovaToolFact = {
  tool: string;
  ok: boolean;
  denied?: boolean;
  data?: Record<string, unknown>;
  error?: string;
};

export type NovaToolPack = {
  facts: NovaToolFact[];
  links: NovaToolLink[];
  toolsUsed: string[];
  range: DateRange | null;
  interpretedAs?: string[];
  entityHint?: string | null;
  personHint?: string | null;
};
