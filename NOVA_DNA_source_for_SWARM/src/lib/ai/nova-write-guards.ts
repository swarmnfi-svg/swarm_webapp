/**
 * Dual write-deny checkpoints for NOVA (read-only invariant).
 * Checkpoint 1: early preflight before plan commit.
 * Checkpoint 2: post-plan guard before tools / RBAC.
 * No LLM write classifier — rules + SearchEngine deny_write only.
 */

import { runNovaSearchEngine } from "@/lib/nova/nova-search-engine";
import {
  isNovaHowToGuideQuery,
  isNovaLiveErpDataAsk,
  matchNovaHelpGuideDef,
} from "@/lib/ai/nova-help-guides";
import { isNovaSafeWorkflowOpenQuery } from "@/lib/nova/safe-workflow";

export const NOVA_WRITE_DENY_ANSWER =
  "NOVA AI is **read-only**. I can summarise and look up data, but I cannot create, edit, approve, pay, or delete records. Use the ERP screens for those actions.";

/** Approve/reject a specific record (not “pending approvals”). */
const APPROVE_REJECT_CUE =
  /\b(approve|reject|cancel)\s+(this|the|my|invoice|bill|payment|request|task|order)\b/i;

const PLEASE_MUTATE_CUE = /\bplease\s+(approve|reject|delete|create|update)\b/i;

export type NovaWriteDenyAnswer = {
  answer: string;
  links: Array<{ title: string; href: string }>;
  toolsUsed: string[];
};

export function novaWriteDenyAnswer(
  checkpoint: "write_preflight" | "write_plan_guard"
): NovaWriteDenyAnswer {
  return {
    answer: NOVA_WRITE_DENY_ANSWER,
    links: [
      { title: "Dashboard", href: "/dashboard" },
      { title: "Help examples", href: "/ai-assistant" },
      { title: "User Manual", href: "/user-manual" },
    ],
    toolsUsed: ["read_only_guard", checkpoint],
  };
}

/** True when the utterance is a clear mutation / write ask (not a how-to guide). */
export function isNovaWriteMutationQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  // Explicit how-to / guide framing → navigation help, never bare refuse.
  if (isNovaHowToGuideQuery(q)) return false;
  // Imperative approve / please-mutate / delete always stay write-deny.
  if (APPROVE_REJECT_CUE.test(q)) return true;
  if (PLEASE_MUTATE_CUE.test(q)) return true;
  if (/\b(delete|remove|void|reverse|mark\s+paid)\b/i.test(q)) {
    return true;
  }
  // Safe workflow open (create form + prefill) is navigate-only — not a mutation.
  if (isNovaSafeWorkflowOpenQuery(q)) return false;
  // Create/add/new against a known module guide → help catalog (still read-only prose).
  if (!isNovaLiveErpDataAsk(q) && matchNovaHelpGuideDef(q)) return false;
  if (runNovaSearchEngine(q).queryFamily === "deny_write") return true;
  return false;
}

/** Checkpoint 1 — before buildNovaPlan / plan commit. */
export function preflightNovaWriteDeny(query: string): NovaWriteDenyAnswer | null {
  if (!isNovaWriteMutationQuery(query)) return null;
  return novaWriteDenyAnswer("write_preflight");
}

type PlanLike = {
  tools?: string[] | null;
  clarifyReason?: string | null;
  source?: string | null;
};

/** Checkpoint 2 — after finalizeNovaPlan, before tools. */
export function guardNovaPlanWrite(
  plan: PlanLike | null | undefined,
  query: string
): NovaWriteDenyAnswer | null {
  if (isNovaWriteMutationQuery(query)) {
    return novaWriteDenyAnswer("write_plan_guard");
  }
  const tools = plan?.tools ?? [];
  if (tools.some((t) => /\b(create|update|delete|approve|reject|write)\b/i.test(t))) {
    return novaWriteDenyAnswer("write_plan_guard");
  }
  // SearchEngine / intent deny_write sometimes arrives as clarify prose — retag as write deny.
  if (
    plan?.clarifyReason &&
    /\bread-only\b/i.test(plan.clarifyReason) &&
    /\b(create|edit|approve|pay|delete)\b/i.test(plan.clarifyReason)
  ) {
    return novaWriteDenyAnswer("write_plan_guard");
  }
  return null;
}
