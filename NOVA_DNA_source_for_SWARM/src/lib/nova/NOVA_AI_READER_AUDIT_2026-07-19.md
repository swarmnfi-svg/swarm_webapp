# NOVA AI + Reader Audit — 2026-07-19

**Date:** 2026-07-19  
**Baseline live (preflight):** `3.1.59` (`erp.empowerbpg.com` ready)  
**Tip from this audit:** `3.1.62`  
**Scope:** NOVA AI (12 engines + Aware / help / reports / Entity 360 / Trend / permission_help) + NOVA Reader (`src/lib/nova-reader/`)  
**Constraints:** No desktop branch; surgical; do not regress permission_help or confirmed-orders routing.

---

## Test catalog (before → after)

| Suite | Before | After |
|-------|--------|-------|
| `src/lib/ai/nova.test.ts` | 359 pass + 1 unhandled GSTR rejection | **359 pass** (GSTR items hardened) |
| `src/lib/nova/**` + phase0 / commercial / permission / confirmed-orders | 1 fail (CD13 write-deny stale) + wr-create stale | **green** |
| `test:nova-reader` | 53 pass | **53 pass** |
| permission_help + confirmed-orders goldens | pass | **pass (no regression)** |

---

## Findings

| ID | Sev | Area | Finding | Status |
|----|-----|------|---------|--------|
| A1 | **P1** | GSTR / money soft-fail | `bucketRateLines` + HSN loop threw when `inv.items` missing → unhandled rejection; snapshot could soft-present empty GST | **FIXED** |
| A2 | **P1** | Profitability soft-fail | `getProjectPl().catch(() => [])` mapped lookup failure to “0 loss-making projects” | **FIXED** |
| A3 | **P1** | GSTR snapshot | Both GSTR-1/3B builders failing still returned `ok:true` with null money | **FIXED** |
| A4 | **P2** | Write-deny goldens | Phase0 `wr-create` + CD13 expected bare `read_only_guard` / mutation; product (3.1.52+) prefers howto + read-only prose for create+module | **FIXED** (tests + billing note aligned) |
| A5 | **P2** | Project “at loss” lock | Lexicon already routes `any project at loss` → `profitability_summary`; missing golden | **FIXED** (routing lock) |
| A6 | — | Reader coerce (3.1.52) | Currency/date coerce suites green; no residual fail | **OK** |
| A7 | — | permission_help (3.1.55) | Goldens green | **OK — do not regress** |
| A8 | — | Confirmed/new orders (3.1.58) | Goldens green → `projects_summary` | **OK — do not regress** |
| A9 | **P2** | Test mock noise | `nova.test.ts` prisma mock missing `_sum` / aggregates → stderr noise (salary/advances/incentives) | **FIXED** (follow-up tip) |
| A10 | **P2** | Follow-up merge | Core recheck fixed in 3.1.37; edge cases beyond locks remain | **FIXED** (follow-up tip — topic-switch + empty prior) |
| A11 | **P2** | Finance `.catch(() => 0)` sweep | Broader skills still map count failures to 0 (tally/documents/proactive) | **FIXED** (follow-up tip) |
| A12 | **P2** | Entity resolve collisions | Party-vs-person tenant QI residuals | **PARTIAL** — shared noise + task includeStaff clarify; soft “Name tasks” party-first still product policy |
| A13 | **P3** | Local schema drift in tests | `HrLeaveType.attendanceEffect` / `salespersonStaffId` missing on local DB → noise only | **DEFERRED** (env) |

---

## Fixes shipped (3.1.62)

| File | Change |
|------|--------|
| `src/lib/reports/gstr1.ts` | Tolerate missing `items` in rate + HSN + CN/DN paths |
| `src/lib/nova/skills/finance/gstr-snapshot.ts` | Soft-fail when both builders error |
| `src/lib/nova/skills/finance/profitability.ts` | Soft-fail P&L lookup; explicit `at loss` in wantsLoss |
| `src/lib/ai/nova-phase0-goldens.test.ts` + catalog | `wr-create` → howto + read-only |
| `src/lib/nova/nova-director-commercial.test.ts` | CD13 aligned to please-create vs bare create |
| `src/lib/ai/nova-help-guides.ts` | Billing guide read-only note |
| `src/lib/ai/nova.test.ts` | `any project at loss` routing lock |
| `*.test.ts` (gstr1 / gstr-snapshot / profitability) | Soft-fail + items locks |

---

## Deferred recommendations

1. ~~Backfill prisma mocks~~ → **closed** (aggregate defaults in `nova.test.ts`).
2. ~~Finance soft-fail sweep (B3)~~ → **closed** (tally / documents / accounts / proactive + `settlePromise`).
3. ~~Follow-up merge edge cases~~ → **closed** (topic-switch-aware recheck + empty-prior clarify).
4. ~~Entity resolve noise centralization~~ → **closed**; residual soft “Name tasks” party-first + LIVE report ACL remain — see `NOVA_AI_READER_AUDIT_DEFERREDS_2026-07-19.md`.
5. **Report packs LIVE:** save/list/download ACL re-check on health-matched build (checklist L4/R7).
6. **A13** local schema drift (env).

---

## Verify checklist

- [x] `npx vitest run` NOVA + phase0 + commercial + permission + confirmed-orders
- [x] `npm run test:nova-reader`
- [ ] `npm run release:verify`
- [ ] `git push origin HEAD` (single deploy trigger)
- [ ] Poll `/api/health` until tip version && `ready:true`

**Follow-up tip closed deferreds A9–A12 (partial A12):** see `NOVA_AI_READER_AUDIT_DEFERREDS_2026-07-19.md`.
