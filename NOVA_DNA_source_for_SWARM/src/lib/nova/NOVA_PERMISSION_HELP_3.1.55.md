# NOVA permission-capability routing — tip 3.1.55

**Date:** 2026-07-19  
**Baseline live (at ship):** verify via `/api/health` (was 3.1.52; 3.1.53–3.1.54 may already be on origin).  
**Coords:** parallel tips — salary overpay warn (3.1.53), Compare & migrate manual (3.1.54). This tip is **AI routing only**.

## Bug

User: **“can manager see profit”**  
Expected: RBAC / permission help (Manager cannot open Project P&L / fund views by default).  
Actual: lexicon synonym `profit` → `profitability_summary` live Project P&L dump.

## Root cause

1. Bare money synonym `profit` in the profitability lexicon topic selected `profitability_summary`.
2. No detector for **role capability** shapes (`can <role> see…`, `who can see…`, `does <role> have access…`).
3. `isNovaLiveErpDataAsk` treated bare `who` as live data, which would also mis-route `who can see profit` if howto ever claimed it.

## Fix

1. `src/lib/ai/nova-permission-help.ts` — deterministic permission asks → answers from `can` / `canAccessPath` / `canViewPayrollSalaryAmounts` (default role probe; honest about grants).
2. Aware kind `permission_help` runs **before** howto and before lexicon/tools.
3. `isNovaLiveErpDataAsk` exempts permission shapes so `who can see…` is not a live pull.
4. Lexicon `selectToolsFromLexicon` returns empty tools for permission shapes (defense).
5. Think + SearchEngine residual prompts: permission_help, not money tools.

## Routing rule (after fix)

| Shape | Route |
| --- | --- |
| `can <role> see/view/access…`, `who can see…`, `does <role> have access…`, `can I see…` + known topic | `permission_help` (RBAC explainer) |
| `show project profit`, `project profit`, `projects on loss`, `fund position` | live `profitability_summary` (unchanged) |
| `can I do / how to…` | `howto_guide` (unchanged) |

## Residual intent classes (not covered)

- Ambiguous “manager profit?” without see/access/can framing — still may hit money lexicon.
- Custom grant matrices beyond default role probe (answer notes per-user Admin grants).
- Non-English role-permission paraphrases without EN verbs.

## Verify

- `vitest` `nova-permission-help.test.ts` + help-guides regression
- Deploy: `git push` only; poll `/api/health` for **3.1.55**
