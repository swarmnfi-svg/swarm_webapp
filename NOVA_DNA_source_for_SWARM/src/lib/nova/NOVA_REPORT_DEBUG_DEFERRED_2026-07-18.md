# NOVA report debug — deferred / remaining gaps (2026-07-18)

Ship tip fixed P0/P1 items separately. Items below were reviewed and deferred.

## Deferred

| Item | Why deferred |
|------|----------------|
| Delivery pack requires delay focus (`wantsDelays && reportIntent`) | **Fixed (v3.1.51+):** delay focus → `delivery_delay_report`; other delivery report asks → `delivery_status_report`. |
| CSV row export still metrics/charts/attentions-only | **Fixed (v3.1.47+):** CSV exports `pack.tables[]` row blocks; metrics/charts/attentions still appended. |
| Pack snapshot size in LLM fact context | Pack is frozen on the fact for Save; LLM path already prefers deterministic narrations. No evidence of money-guard bypass into narration; revisit if token pressure shows up. |
| `tasks_light` not in save-follow-up allowlist | Prep / unfinished pack — keep out until product signs off. |
| Amount-token receipt lookup spans all time (POSTED only) | Intentional find-by-amount UX; period scoping would miss matches. POSTED filter is required and fixed. |
| Soft FP: “export …” / “download …” on non-report chat | **Partially fixed:** meta how/where/did-we / export-mapping questions excluded from report intent. Bare “export expenses” / “download overdue…” remain true positives (artifact asks). |

## Fixed in this tip (summary)

1. Skill report pack ids missing from `NOVA_SAVEABLE_PACK_IDS` → verbal “save report” clarified away.
2. Bare `\bsave\b` report-intent false positives (“what did we save…”, “save attendance…”).
3. Receipts amount-token hits omitted `postingStatus: POSTED` (PENDING leakage vs 3.1.41).
