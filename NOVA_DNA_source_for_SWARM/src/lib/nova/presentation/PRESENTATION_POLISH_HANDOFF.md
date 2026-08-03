# Presentation polish — integrated

**Branch:** `nova-presentation-polish-prep`  
**Status:** Wired into `formatFactsPolished` + `resolveNovaPresentationMode`  
**Authority:** `src/lib/ai/nova-presentation.ts` (modes) · `src/lib/nova/presentation/` (module formatters)

## Modes

| Mode | Use |
|------|-----|
| `deterministic_polished` | Queues / registers — no LLM |
| `hybrid_guarded` | Overviews / money / attendance — LLM + guards → polished fallback |
| `deterministic_raw` | Tests/debug only |

## Formatters owned here

sales, receipts, tasks, bank (+ recon), approvals, pending_workflow, payment_requests, customers.

Attendance polished lives in `nova-format.ts` (`formatAttendancePolished`).

## Invariants

- Facts stay deterministic; formatters never invent counts/INR.
- Answer-guard fallback is always polished (never raw).
- Mode maps: do not diverge `contract.ts` from `nova-presentation.ts` (contract re-exports core).
