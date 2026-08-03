# NOVA Aware Engine

`nova_aware` is NOVA's deterministic route for self-awareness, help, capability, language, reports, reader, module-support, and **ERP how-to / guide** questions.

## Why It Exists

General questions such as `languages support` or `what can NOVA do` are not ERP entity requests. They must not enter customer/vendor/project resolution, sticky follow-up merge, or a previous `Reply with the number` clarification.

The route runs early in `answerNovaQuery`, before pending clarify resolution. When it matches, NOVA clears pending entity clarification, sticky bound entity, conversation slots, and last savable pack context before returning the aware answer.

## Covered Questions

- `languages support`
- `what languages do you support`
- `can you speak Hindi/Malayalam/Tamil/Spanish`
- `what can NOVA do`
- `help`, `NOVA help`, `NOVA capabilities`
- `how to use NOVA`
- `what reports can NOVA generate`
- `can NOVA read documents`
- `use reader`
- `what modules do you support`
- **How-to / guides (RBAC-aware):** `how to enter employee salary`, `can i do part payment of salry`, `how to create tasks` / `guide me to create tasks`, payment requests, attendance punch/regularise/register, staff advances, projects, sales orders, receipts, billing
- **Permission / role capability (RBAC matrix):** `can manager see profit`, `can staff see salary`, `can accountant view bank`, `does manager have access to KPI`, `who can see profit` — answers from real `can` / `canAccessPath` / payroll helpers; never dumps live P&L
- **Compare & migrate:** `migrating from Tally`, `how is GST different from Tally`, `where is ledger in emPOWER vs Zoho`, godown / concept maps (User Manual → Compare & migrate tab)

## How-to / User Manual Grounding

Implementation: `src/lib/ai/nova-help-guides.ts` (kind `howto_guide` in `nova-aware.ts`).

1. Detect instructional intent (`how to`, `guide me`, `can I do`, domain phrases like `part payment of salary`).
2. Match a curated guide catalog (aliases include typos such as `salry` → salary).
3. Prefer steps from `getNovaManualCorpus()` (full `MANUAL_SECTIONS` + Compare & migrate) in `src/lib/user-manual.ts` / `user-manual-compare.ts`; fall back to curated steps.
4. Filter links with `canAccessPath` — only deep-link screens the user can open; otherwise explain permissions may apply.
5. Always keep NOVA read-only for mutations: guide to the ERP screen, never claim chat can create/edit.

Write-shaped asks that are instructional (`how to create tasks`) skip SearchEngine `deny_write` and the write preflight so users get a navigation guide instead of a useless refusal.

After editing `user-manual.ts` or `user-manual-compare.ts`, regenerate the PDF with `npm run manual:pdf` so offline downloads stay in sync. NOVA reads the TypeScript manual corpus directly (no separate index rebuild).

## Language Source

The app language list is sourced from `LOCALES` in `src/lib/i18n/locale.ts`.

Current app language packs include English; Indian languages including Hindi, Malayalam, Tamil, Telugu, Bengali, Kannada, Marathi, Gujarati, Punjabi, Urdu, Odia, and Assamese; Spanish; and Chinese Simplified/Traditional.

NOVA's answer stays conservative: text chat and translation-style help can vary by browser input, fonts, and model/configuration quality. NOVA does not claim voice/speech support. ERP records and numbers remain permissioned and server-authoritative in every language.

## Clarify Reset Contract

If a user has an active entity clarification and asks a capability question:

1. NOVA answers via `nova_aware`.
2. `pendingClarify`, `bound`, `slots`, and `lastSavablePack` are cleared in the returned dialog state.
3. A later `1` is not applied to the old customer/vendor/project list. It is treated as a fresh unscoped message unless there is a real current disambiguation.

This preserves normal numbered replies for real current clarifications while preventing stale clarify history from leaking into meta/help conversations.

## NovaThink / LLM intent (module binding)

When plan confidence is low and Think/planner is enabled, the LLM fills **SearchEngine slots only** (validated tool allow-list). Prompt rules now:

- How-to / guide → `howto_guide` (empty tools, no party resolve) — Aware usually handles these first.
- Permission / RBAC → `permission_help` (empty tools) — never profitability/salary/bank data dumps.
- Typos (`salry` → salary) and domain nouns bind to **modules/skills**, not fake parties.
- Bare create/delete without how-to framing still → `deny_write`.
- Facts/money always come from RBAC-gated skills — LLM never invents ERP amounts.
