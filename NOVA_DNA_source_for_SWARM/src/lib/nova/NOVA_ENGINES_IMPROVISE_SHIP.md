# NOVA Engines Improvise — Ship Notes

**Tip:** `3.1.13` (bare pending/open for person)  
**Date:** 2026-07-14  
**Coords:** hit-or-miss diagnosis (`3f20dcd3`), QI harm audit, recovery 3.1.7–3.1.8, bug sweep (`4ebbfbc6`); Analysis cue `3.1.10`; attendance early-in/late-out `3.1.11`; caption consistency `3.1.12`

## Tip lineage (recent)
| Version | What |
|---------|------|
| **3.1.9** | Parent/child auto-bind + person paraphrases + Analysis money-late + Trend attendance ACL |
| **3.1.10** | Analysis cue: `why {entity} tasks overdue` first-class (QI-A*) |
| **3.1.11** | Admin rule: credit early-in and late-out in monthly attendance |
| **3.1.12** | `james school tasks` customer vs project caption consistency |
| **3.1.13** | **This tip** — bare `pending|open for {Name}` → person tasks (not search) |

## 3.1.13 — bare pending/open for person
- **Root cause:** `pending for Arif` had no `tasks` cue → not a personal-task shape → SE/tools fell through to `search_entities` with null personHint.
- **Fix:** personal-task shape + lexicon person extract + structure moduleHint=tasks/staff for bare `pending|open for Name`; overdue bare-for stays finance; approvals/payments excluded.
- **Golden:** QI-P9 / QI-P10 (`pending for Arif`, `open for Arif`).

## 3.1.12 — customer vs project task captions
- **Root cause:** parent/child bind correctly chose **customer** James school, but `tasks_summary` still built a soft `entityFilterName` “project” where and set `projectScoped=true`, so Present/LLM emitted Avaada project trust copy (“project-filtered / never org-wide”) while sticky/bind still said customer. Raw DB names with trailing space showed as fake project “James school ”.
- **Fix:** id-bound customer → `project.customerId` scope + `customerScoped` note only; project bind keeps project trust copy; trim trailing-space labels in resolve + facts.
- **Golden:** `james school tasks` narration is customer-consistent (no customer+project double claim).

## What shipped in 3.1.9 (module-wide)

### Entity Resolve (all modules)
- **Parent/child collapse:** customer + only that customer’s child projects (`C0026` vs `C0026-P001`) → auto-bind **customer** (no Did-you-mean).
- **Exact project name** still binds project (`james school 3 cum …`).
- Shared in `resolveNovaEntityHint` → tasks, invoices, outstanding, receipts, deliveries, docs, etc.

### Search / Lexicon / Structure
- Broader personal-task shapes: `show me … overdue tasks`, `does X have …`, Hinglish `ka/ke` **with** status.
- Leading `Name pending|open|overdue tasks` → **person_prefer** before party (tenant collision safe).
- Bare `Name tasks` / `avaada ka task` stay **party-first**.
- SE: stop `show … tasks` name-search steal on personal shapes; fix `show me` prefix.
- Ranking + party/project-only org-wide gate unchanged (3.1.7–8).

### Dialog sticky
- Conversation slots carry `personHint`; module-only “pending tasks” after a personal-task answer does **not** demand party bind.

### Absorbed bug-sweep P0s (held tip)
- Analysis: `why late payment|invoices|delivery` → depth **thin** (not forced `nova_analysis`).
- Trend attendance: self-only staff cannot pull peer late trend by name.

## Engines touched
SearchEngine, Lexicon, query-structure, Entity Resolve, Dialog/Sticky, Tools orchestrator, Analysis depth/cue, Trend ACL, QI harness; **3.1.12** Present/Narrate + tasks skill scope captions; **3.1.13** personal-task shape + person extract.

## Modules covered via shared resolve
Tasks · invoices/sales · outstanding/receivables · projects · receipts · approvals · delivery · GRN · documents (any skill using `resolveNovaEntityHint`).

## Restored earlier behavior
Multi-word combined asks like **`james school tasks`** answer under the customer (or exact project when uniquely named) instead of parent/child clarify dead-end — with **matching** customer-scoped narration (3.1.12).  
Bare **`pending for Arif`** now routes as personal tasks (3.1.13).

## Goldens
QI-M1…M3, QI-P6…P10, QI-A* (3.1.10), hierarchy unit tests; **3.1.12** `task-party-scope` caption goldens.

## Flag
`NOVA_QI_STRICT_PARTY_GATE=1` still forces party-first on soft personal shapes (debug only).
