/**
 * Subject / person-identity guards for NOVA (read-only).
 * Prevents addressing the session user as a different person named in the query.
 * Super Admin / broad RBAC may still *see* that person's data — this only checks narrative voice.
 */
import type { NovaToolFact } from "@/lib/ai/nova-tools";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type SubjectLike = {
  name?: string;
  relation?: string;
};

function subjectFromFacts(facts: NovaToolFact[]): SubjectLike | null {
  for (const f of facts) {
    if (!f.ok || f.denied || !f.data) continue;
    const s = f.data.subject as SubjectLike | undefined;
    if (s?.name && s.relation) return s;
  }
  return null;
}

/**
 * When facts.subject.relation is "other", the model must not:
 * - greet/address the session user as that person's first name ("Zeeshan, …" / "Hi Zeeshan")
 * - speak in second person about "your tasks/leave/KPI" for that person's work
 *
 * Third person ("Zeeshan has 3 open tasks") is correct and must pass.
 * Returning another person's data for Super Admin / task.admin is allowed — only voice is guarded.
 */
export function llmPreservesSubjectIdentity(
  content: string,
  facts: NovaToolFact[],
  sessionFirstName: string
): boolean {
  const subject = subjectFromFacts(facts);
  if (!subject || subject.relation !== "other" || !subject.name) return true;

  const subjectFirst = subject.name.trim().split(/\s+/)[0];
  if (!subjectFirst || subjectFirst.length < 2) return true;

  const session = sessionFirstName.trim();
  if (session && subjectFirst.toLowerCase() === session.toLowerCase()) return true;

  const text = content.trim();

  // Vocative address only: "Zeeshan," / "Hi Zeeshan," / "Hey Zeeshan —" — not "Zeeshan has…"
  const vocative = new RegExp(
    `^(?:(?:hi|hey|hello|hiya)\\s+)?${escapeRegExp(subjectFirst)}\\s*[,—–!:]`,
    "i"
  );
  if (vocative.test(text)) return false;

  // "Zeeshan, here are your tasks" mid-sentence vocative + second person
  const midVocativeSecondPerson = new RegExp(
    `\\b${escapeRegExp(subjectFirst)}\\s*[,—–]\\s*(?:here|you\\b|your\\b)`,
    "i"
  );
  if (midVocativeSecondPerson.test(text)) return false;

  // Second-person ownership of the other person's work (tasks / leave / KPI / attendance / advances)
  if (
    /\b(your\s+(?:open\s+|pending\s+|overdue\s+)?(?:tasks?|leave|kpi|incentives?|advances?|salary|attendance|late\s+minutes?|payslip)|you\s+have\s+\d+\s+(?:open\s+|pending\s+)?(?:tasks?|leave|days?)|you\s+(?:were|are)\s+(?:late|absent|present)|your\s+score|your\s+grade|you\s+came\s+late)\b/i.test(
      text
    )
  ) {
    return false;
  }

  return true;
}
