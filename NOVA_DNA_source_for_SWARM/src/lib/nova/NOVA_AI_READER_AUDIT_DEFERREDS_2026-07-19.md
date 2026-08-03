# NOVA AI Reader Audit — deferreds closed follow-up (2026-07-19)

**Parent audit:** `NOVA_AI_READER_AUDIT_2026-07-19.md`  
**Tip:** see `package.json` / live `/api/health` after ship (live+1 from baseline at tip time).

## Closed this tip

| ID | Area | What landed |
|----|------|-------------|
| **A11** | Finance soft-fail sweep | `settlePromise` helper; `tally_status` / `documents_open` / `accounts_snapshot` return `ok:false` when primary counts fail (never invent 0). `proactive_insights` drops bare `.catch(() => 0)`; all-runner failure → `ok:false`. |
| **A10** | Follow-up merge edges | Recheck uses topic-switch-aware `lastRecheckableUserText`; empty / non-ERP prior → clarify ask (no garbled merge, no leap to stale sales). Locks in `nova.test.ts`. |
| **A12** | Entity collisions | Lexicon `isNovaEntityHintNoise` + follow-up `isNovaEntityNoiseQuick` share `isNovaTemporalOrModuleEntityNoise`. Single-token `tasks_summary` resolves load staff chips (`includeStaff`) so party+staff soft collision clarifies. QI goldens QI-P11 / QI-C1..C3 + commercial-guards collision lock. |
| **A9** | Test mock noise | `nova.test.ts` prisma mock defaults for `salaryPayment` / `staffAdvance` / `paymentRequest` aggregates + `staffIncentive` / `staffAdvance.groupBy`. |

## Still deferred

| ID | Why still open |
|----|----------------|
| **A13** | Local schema drift (`HrLeaveType.attendanceEffect` / `salespersonStaffId`) — env/DB only; not a product code change. |
| Report packs LIVE ACL (L4/R7) | Needs health-matched save/list/download re-check on production build — ops checklist, not this tip. |
| Broader party-vs-person policy | Soft “Name tasks” (no pending/open/overdue) still party-first by product; only collision clarify when staff soft-matches. Further person_prefer expansion needs product sign-off. |

## Tests

- `src/lib/nova/skills/soft-fail-settle.test.ts` (new)
- `src/lib/ai/nova.test.ts` — recheck topic-switch + empty prior
- `src/lib/nova/query-structure/index.test.ts` — shared noise
- `src/lib/ai/nova-commercial-guards.test.ts` — includeStaff collision
- QI harness goldens QI-P11, QI-C1..C3
