# NovaPlan design note

Stable query-plan layer so NOVA routing is deterministic and the LLM is **answer-only**.

## Shape

```ts
NovaPlan {
  query, module?, metric?, period?, entity?, person?, status?,
  tools[], confidence, clarifyReason?, interpretedAs?,
  periodDefaultApplied?, source
}
```

## Pipeline

```
normalize → slots (lexicon / composeNovaIntent)
  → NovaPlan (+ module period defaults)
    → tool router (contracts; RBAC filter)
  → facts pack
  → answer (LLM presenter | deterministic format)
  → existing money / period / entity guards
```

*(Phase F wraps this — see pipeline with inference below.)*

Rules own the plan. LLM may **fill slots** only when `confidence === "low"` — never free tool pick.

## Ambiguity rule

Clarify **only** when the plan is incomplete (`shouldClarifyNovaPlan`).
Ready tools ⇒ never steal into bare-period / bare-entity loops (replaces brittle `skipSteal` allowlists).
Money / expenses / GRN keep `periodDefault: "none"` + required period so bare words still clarify.

### Entity / person disambiguation (Phase Clarify)

When `resolveNovaEntityHint` / `resolveNovaPersonHint` finds **multiple** RBAC-visible candidates, NOVA returns a clarify card (`nova-clarify.ts`) with numbered options (id, label, type, code) — **not** guessed sales/KPI totals.
The next user message selecting an option (`1`, label, or code) is a follow-up: `resolveNovaFollowUp` merges the entity/person slot onto the prior plan and re-runs tools.
Unique match → no clarify. Meta / WH (“who punched late”) never become person clarify.
Inference `unclear` with no ready tools → structured metric clarify (not unmatched dead-end); explicit `search`/`find` still uses data-search / catalog suggest.

## Follow-ups

`mergeNovaPlanSlots` / `novaPlanFollowUpPatch` / `novaPlanToRoutingQuery` — update entity/period/status on the prior plan; do not feed prior assistant ₹ prose into routing.
`resolveNovaFollowUp` returns an optional merged `plan` for entity/period swaps.

## Migration

| Phase | Work |
|-------|------|
| **A** (landed) | `nova-plan.ts` types, contracts, helpers, tests |
| **B** (landed) | `answerNovaQuery` builds plan once; `shouldClarifyNovaPlan` gates clarify; `plan.tools` drive execution |
| **C** (landed) | Slot-based follow-ups in `nova-context`; LLM planner slot-fill only when `confidence === "low"` |
| **D** (landed 2.62) | Unmatched → synonym feed: catalog near-miss suggestions in answers + `/system/nova-unmatched` grouped lexicon hints |
| **E** (landed 2.63) | Broader CI eval matrix (salary / incentives / expenses / stubs / delivery / KPI / payments / leave / entity follow-up); pragmatic open tools `documents_open` / `settings_open` / `vendor_bank_open` (deep-link facts, no invented money) |
| **F** (landed 2.64) | **Inference layer** (`nova-inference.ts`) in front of NovaPlan: classify `meta` \| `erp_query` \| `follow_up` \| `unclear` \| `garbage` before slot merge. Meta (“ur capabilities”, help) never becomes person/entity or sticky attendance tools. WH-attendance (“who punched late”) → erp_query with person=null. Non-referential name stop shared with person/entity extractors. |
| **F2** (landed 2.65) | Inference hardening: topic-switch → `erp_query` + `allowFollowUpMerge: false`; attendance bare-person → `follow_up` + person merge; broader meta/stop; `hasErpSignal` via lexicon topic hits; optional `moduleHint` |
| **G** (partial 2.65) | `nova-module-bridge.ts` NAV→topic/toolMode/smoke; `NOVA_MODULE_CONTRACTS` for high-traffic tooled topics (PR/PO/SO/customers/staff/bank/recon/…); matched topics never bare-entity / stub when tools exist |
| **H** (landed 2.65) | Open tools for missing nav: `notifications_open`, `whatsapp_open`, `portal_open`, `automation_open`, `links_open`, `bank_sms_open`; `bank details` → `vendor_bank_open` |
| **Clarify** (landed 2.66) | First-class disambiguation (`nova-clarify.ts`): low-confidence / `unclear` → structured clarify; multi-match entity/person → numbered “Did you mean…” options (RBAC-filtered); reply `1` / label / code merges slot and continues prior metric/period. Never run money tools on a guessed party. Catalog near-miss stays separate. |
| **2.66.1** | Attendance day integrity: late/present/absent use register `@db.Date` + `pickAttendanceRowForDay` (no IST gte/lte DATE bleed). Present = register statuses; `MISSING_PUNCH_IN` ≠ present. “was X present” extracts person. |
| **2.71.0** | Punch/presence routing: “did X punch / who didn’t punch” → present/absent focus (not late list). `subjectAttendance` always used for named person. Register auto-materializes MISSING_PUNCH_IN for never-punched ACTIVE staff. |
| **2.72.0** | EOD attendance cron (`/api/hr/attendance/cron`) finalizes all ACTIVE staff (IST yesterday). Auto half-day waives late/early minute double-deduct. OT pay = APPROVED records only (no daily-OT fallback). |
| **2.66.2** | Count-first answers (payment requests awaiting, pending queues): deterministic format skips LLM; money-guard fallback silent when no headline ₹ — no “restated amounts inconsistently” on count-only asks. |
| **I** (landed 2.67) | Thin → summary: `vendor_bank_open` presence counts (no bank identifiers); `documents_open` counts by module (honest empty); richer `accounts_snapshot` / `tally_status` + sub-links (no invented TB). |
| **Confirm chips** (landed 2.67) | Period/metric/entity clarifies prefer selectable `options` + `clarifyKind` chips over vague prose. |
| **J / admin opens** (landed 2.67) | `backup_open` / `system_tools_open` / `audit_log_open` + bridge-derived CI smoke matrix (`novaBridgeSmokeCases`). |

## Pipeline (with Phase F)

```
raw utterance
  → inferNovaQuery (meta / erp_query / follow_up / garbage / unclear)
  → [meta → help/access/company; garbage → soft empty]
  → resolveNovaFollowUp only when allowFollowUpMerge
  → NovaPlan (+ module period defaults)
  → tool router (contracts; RBAC filter)
  → facts pack
  → answer (LLM presenter | deterministic format)
  → money / period / entity / late-name guards
```

NovaPlan backend is unchanged — inference is differentiation only.

## Phase 1 — skills + split (landed 2.100.0 → 2.108.0)

Product rule: NOVA stays permission-aware ERP intelligence — **not** a free ChatGPT / SQL agent. Preserve NovaPlan, inference, RBAC, money/late/present guards, read-only default.

| Status | Work |
|--------|------|
| **Done** | `src/lib/nova/` package: `core/` re-exports, `skills/skill-contract.ts`, `skills/registry.ts`, provenance helpers |
| **Done** | Register skills: HR `attendance_late_summary` + finance `sales_summary` / `receipts_summary` / `payment_requests_summary` |
| **Done (2.102)** | Split + register: `leave_summary`, `tasks_summary`, `my_work_summary`, `stock_summary`, `delivery_summary`, `kpi_summary`, `bank_recon_summary`, `receivables_summary`, `documents_open`, `settings_open` |
| **Done (2.108)** | Split + register: `salary_summary`, `incentives_summary`, `staff_advances_summary`, `staff_expense_summary`, `projects_summary`, `search_entities`, remaining `*_open` (appearance, vendor bank, notifications, whatsapp, portal, automation, links, bank SMS, backup, system tools, audit log) |
| **Done** | Extract handlers → skill modules; `runNovaTools` dispatches via registry |
| **Done** | Hard invariant kept: late lists deterministic-first (`preferDeterministic` + late-name guard from 2.96.2); person/amount/date from fact pack |
| **Done** | Provenance on key facts + `NovaAnswer.provenance` (`period`, `sources`, `freshness`) |
| **Done (2.102)** | Server conversation memory: `NovaConversation` / `NovaMessage` (redacted); sensitive (salary/bank) shorter retention; sessionStorage fallback kept |
| **Done (2.102)** | Provider allow-list by data class: FINANCIAL/PERSONAL prefer local (`custom`) then approved cloud (Groq/Gemini/OpenAI); drop free-tier OpenRouter/Together/Fireworks unless `NOVA_LLM_ALLOW_CLOUD_SENSITIVE` |
| **Done (2.102)** | Broader golden CI: late/present/absent, salary, delivery delays, tasks/stock/receivables/recon, meta capabilities |
| **Done (2.108)** | Phase 2 starter: `daily_brief` — role pack composing registered skills (read-only; no silent writes / free LLM tool pick) |
| **Done (2.112)** | daily_brief packs: director +`leave_summary`; manager +`stock_summary` |
| **Done (2.113)** | Extract + register `sales_orders_summary` / `purchase_orders_summary` skills |
| **Done (2.115)** | Extract + register ledger snapshots: `accounts_snapshot`, `gstr_snapshot`, `director_dashboard_summary`; daily_brief director +`accounts_snapshot`; accountant +`accounts_snapshot`/`gstr_snapshot` |
| **Done (2.116)** | Extract + register remaining ledger-adjacent: `tally_status`, `order_book_summary`, `reports_snapshot`, `gst_docs_summary`, `profitability_summary`; daily_brief director +`order_book_summary`; accountant +`gst_docs_summary` |
| **Done (2.117)** | Expand daily_brief role packs: director +dashboard/SO/projects/reports/profitability; manager +SO/PO/delivery/projects/KPI; accountant +PO/tally/reports; staff +KPI/incentives (registered skills only) |
| **Done (2.119)** | Extract + register final finance ledger tools: `overdue_invoices`, `purchase_bills_summary`, `bank_accounts_summary`, `credit_notes_summary`, `customer_outstanding` |
| **Done (2.125)** | Queue/masters extracted from `nova-tools.ts` → registry skills (workflow counts, vendors/customers/staff, PRs, approvals, CBG, GRN) |
| **Done (2.127)** | Wire skill `preferDeterministic` into answer path (`packPrefersDeterministicCounts` + `novaSkillPrefersDeterministic`) so OT/reg/delivery/GRN/daily_brief skip LLM when flagged |
| **Deferred** | Project health / draft actions (Phase 2+) |

`src/lib/ai/nova*.ts` imports remain supported — no big-bang delete.

## Next (post-Phase 1 / Phase 2)

- Further daily brief polish only when new skills register (still compose registered skills only)
- Deeper Phase I summaries only where ledger facts are real (never invent TB / bank IDs)
- Project health / draft actions remain deferred

## Weekly ritual (unmatched → lexicon)

1. Open `/system/nova-unmatched` (or `npx tsx src/lib/ai/nova-unmatched-review.ts`) and skim recurring phrases + suggested topics.
2. Add synonyms / `PHRASE_EXPAND` in `nova-lexicon.ts` (Hinglish in `nova-normalize.ts` when needed).
3. Ship a small PR; confirm the same ask hits a primary tool (not `unmatched_review` / `lexicon_stub`).
4. Optional: `NOVA_LLM_PLANNER=true` on staging only — still lexicon-validated; never write actions.

## 2.68.0 RBAC hardening

- `documents_open` / `settings_open`: nav / `settings.write` gates (not bare `ai.assistant.read`); document vault counts no longer leak to STAFF
- Clarify metric/pending/entity chips RBAC-filtered via `filterNovaClarifyChipsForUser`; salary → `my payslip` when self-only
- Soft-deny when matched tools are all filtered (documents for STAFF) even if lexicon permission was over-broad

## 2.69.0 Appearance + documents deny UX

- Staff “settings” / theme / appearance → `appearance_open` (`/settings/appearance` only); `settings_open` still needs `settings.write`
- Documents soft-deny copy clarifies vault/menu deny (no org counts)

## 2.70.0 Richer open facts + safe defaults

- `documents_open` / `settings_open` / `notifications_open`: safer summaries (module + recent/archived counts; company name/timezone/active users; unread count) — no file bodies, passwords, or bank IDs
- Silent period defaults for safe non-money modules (`bank_recon`, `reports`, `gst_docs` → month; receivables/payables/outstanding → open queue)
- Unmatched lexicon expands (theme / vault / company profile) + weekly ritual documented above

## 2.75.0 `documents.read`

- Additive hub entry permission (`documents.read`) on MANAGER / ACCOUNTANT / DIRECTOR (+ Admin ALL)
- Nav + route-access + NOVA `documents_open` gate on `documents.read`
- Per-module hub ACL (`readableDocumentModules`) unchanged — entry ≠ row visibility
- Grantable for STAFF who need the hub without a role change

## 2.79.0 Attendance half-day leave LOP

- Session-aware `FIRST_HALF` / `SECOND_HALF`: paid half + worked session is present (not false half-day LOP); unpaid half + no-show = full unpaid
- Register materializes no-shows for team/read (not only write)
- See `ATTENDANCE.md` / `docs/HR-ATTENDANCE-BULLETPROOF.md`

## Map to today

| Today | NovaPlan |
|-------|----------|
| `NovaSlot` / `composeNovaIntent` | Builds plan via `buildNovaPlanFromIntent` |
| `novaAmbiguityClarification` + skipSteal | → `finalizeNovaPlan` + `shouldClarifyNovaPlan` |
| Tool executor silent defaults (KPI latest, delivery month) | → `NOVA_MODULE_CONTRACTS.periodDefault` |
| `resolveNovaFollowUp` string merge | → `mergeNovaPlanSlots` + `novaPlanToRoutingQuery` |
| `planNovaTopicsWithLlm` tool pick | → slot-fill only when low confidence |
| Empty-tool lexicon stubs | → ready open tools (`*_open`) or residual `lexicon_stub` only when tools still empty |
| Raw ask mid-thread | → `inferNovaQuery` (Phase F) before follow-up / plan |
