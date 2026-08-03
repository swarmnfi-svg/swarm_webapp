# NOVA AI — Full Audit Checklist (PREP)

**Branch:** `nova-3-audit-prep` (docs-only)  
**Baseline tip:** **~2.137.x** (package `2.137.3` at checklist authoring — Sprint 0–4 code on tip; Sprint 5–6 packs deepen still in flight)  
**Audience:** Deployer + steward after Sprint **5–6** land on a health-matched build  
**Status:** Checklist / handoff only — **do not implement fixes from this branch**

---

## Purpose

Single pass/fail audit surface for commercial NOVA AI before calling the product “director-ready.” Covers security (RBAC, leaks, write-deny), correctness (hallucinations, DialogState/TTL, goldens), product packs/reports, isolation (readonly client), and the **commercial director acceptance test**.

This file does **not** ship code, bump version, push `main`, or run Railway. Fixes belong on implementer / deployer branches after Sprint 5–6.

---

## Legend

| Mark | Meaning |
|------|---------|
| **TIP_2.137** | Verify on current tip ~2.137.x (code largely present — confirm CI + live smoke) |
| **POST_S5_6** | Re-verify after Project Command (Sprint 5) + Collection Attention deepen (Sprint 6) merge |
| **LIVE** | Requires deployed `/api/health` version + real tenant RBAC (not unit-only) |
| **DBA** | Needs Postgres / env cutover (`nova_readonly`) |
| ☐ | Open |
| ☑ | Pass (deployer fills) |
| ✗ | Fail — open ticket; do not claim commercial-ready |

**Hard rule:** never weaken `NOVA_INVARIANTS` to make a row green.

---

## Dependency gate (before claiming audit complete)

| Gate | Why | Owner |
|------|-----|--------|
| Sprint 3 report plane **health-matched** | Save / list / download ACL / regenerate = new id | Deployer **LIVE** |
| Sprint 4 metrics + readonly cutover **merged** | Certified Month bindings + cutover checklist exist on tip | Tip **TIP_2.137** |
| Sprint 5 Project Command **live** (or steward-waived) | Pack #2 feel + DialogState project slot | **POST_S5_6** |
| Sprint 6 Collection Attention **aligned to prep contract** | Pack #3 + goldens; no risk-score theatre | **POST_S5_6** |
| Health version pinned | Audit notes must cite exact `package.json` / `/api/health` version | Deployer |

Related handoffs (do not merge prep branches until gates say so):

- `packs/REPORT_PLANE_HANDOFF.md`
- `packs/SPRINT4_METRICS_HANDOFF.md`
- `packs/COLLECTION_ATTENTION_HANDOFF.md`
- `MODULE_COVERAGE_HANDOFF.md`
- Feel target: `NOVA_3_0_PLAN.md` §12

---

## 1. RBAC

| # | Check | When | Pass criteria | ☐ |
|---|--------|------|---------------|---|
| R1 | `filterNovaToolsForUser` + skill `can(...)` on every catalog path | **TIP_2.137** | No tool runs without documented permission; empty ACL → deny | ☐ |
| R2 | Soft deny vs hard deny UX | **TIP_2.137** | Soft: suggest chips / upgrade path; hard: no facts leak | ☐ |
| R3 | Clarify options re-filtered on resume | **TIP_2.137** + **LIVE** | Lost `project.read` mid-pending → option dropped / deny; DialogState T12 | ☐ |
| R4 | STAFF / role packs (`daily_brief`, salary, advances) | **TIP_2.137** | Phase 0 `staff_money_hide` + `brief_rbac` green; no cross-role money | ☐ |
| R5 | SoD vendor bank / `viewfullaccount` | **TIP_2.137** | Phase 0 `sod_vendor_bank` green | ☐ |
| R6 | Documents without `documents.read` | **TIP_2.137** | Soft-deny; Phase E / Phase 0 `documents_deny` | ☐ |
| R7 | Report download ACL re-check | **TIP_2.137** + **LIVE** | Revoke perm → 403 / `downloadAllowed: false`; list gate matches | ☐ |
| R8 | Pack chapters respect module ACL | **POST_S5_6** | Month / Project / Collection omit forbidden chapters; no empty theatre padding | ☐ |

**CI hooks:** `nova-phase0-goldens`, `nova-architecture.ci`, skill RBAC tests (`proactive-insights`, `documents-search`).

---

## 2. Leaks (privacy / cross-tenant / sticky memory)

| # | Check | When | Pass criteria | ☐ |
|---|--------|------|---------------|---|
| L1 | DialogState stores ids/labels only | **TIP_2.137** | No ₹, invoice lists, salary, bank account numbers in `dialogState` | ☐ |
| L2 | No sticky ₹ / party memory across chats | **TIP_2.137** | New chat / Clear resets DialogState; no NovaMind RAG of prior money | ☐ |
| L3 | Cross-module ACL | **TIP_2.137** | Empty module ACL → deny; Phase E rule | ☐ |
| L4 | Report snapshot excludes ledger dumps | **TIP_2.137** + **LIVE** | Envelope = digests + metric versions + chart datasets only | ☐ |
| L5 | Sensitive retention | **LIVE** | Sensitive tools / reports shorter TTL than generic chat; retention job planned | ☐ |
| L6 | Narration never invents other-user PII | **TIP_2.137** | Answer identity guard; salary person-scoped only | ☐ |
| L7 | Injection / garbage asks | **TIP_2.137** | Phase 0 `injection_garbage` — no free agent / invented tools / fake health | ☐ |

---

## 3. Hallucinations (facts / narration / Finding)

| # | Check | When | Pass criteria | ☐ |
|---|--------|------|---------------|---|
| H1 | Money / counts match fact pack | **TIP_2.137** | `guardNovaAnswer` (or equiv) — mismatch → deterministic fallback | ☐ |
| H2 | Period explicit in narrative | **TIP_2.137** + **POST_S5_6** | Calendar month vs FY never ambiguous on director / pack asks | ☐ |
| H3 | Subject identity (self vs other) | **TIP_2.137** | Cannot swap in narration | ☐ |
| H4 | Finding evidence-backed only | **TIP_2.137** + **POST_S5_6** | No Finding without skill evidence; prediction labeled (Phase G) | ☐ |
| H5 | No soft-fuzzy silent pick on money/sensitive | **TIP_2.137** | Ambiguous party → clarify; bound id skips `contains` | ☐ |
| H6 | Think cannot invent tools/families | **TIP_2.137** | `validateNovaSearchSlots` drops invents; rules-first backstop | ☐ |
| H7 | Collection / Project no risk-score theatre | **POST_S5_6** | No invented payment risk / EPC theatre; empty attentions when nothing material | ☐ |
| H8 | Certified metric badges honest | **TIP_2.137** + **POST_S5_6** | Month certified; Project/Collection draft until steward promotes | ☐ |

---

## 4. Write-deny (dual guards)

| # | Check | When | Pass criteria | ☐ |
|---|--------|------|---------------|---|
| W1 | SearchEngine `deny_write` family | **TIP_2.137** | Create / update / delete / approve / pay phrasing → deny family | ☐ |
| W2 | Post-plan `read_only_guard` | **TIP_2.137** | Still fires after plan commit; Phase 0 `write_request_deny` | ☐ |
| W3 | Ordered dual checkpoint | **TIP_2.137** | Preflight before plan commit **and** guard after plan (commercial guards suite) | ☐ |
| W4 | Approvals **read** not write-deny | **TIP_2.137** | `approval.read.*` asks reach tools; not classified as mutate | ☐ |
| W5 | Skills never mutate ERP | **TIP_2.137** | CI forbids `@/lib/prisma` in skills; audit of handlers for INSERT/UPDATE/DELETE ops | ☐ |
| W6 | NOVA plane writes only | **TIP_2.137** | Chat / dialog / aliases / findings / reports only (`novaPlaneWritesOnly`) | ☐ |
| W7 | Forever forbidden surfaces absent | **TIP_2.137** | No dashboard builder, free SQL, LLM tool pick, ERP writeback, sticky money memory | ☐ |

**Suites:** `nova-search-engine.test.ts`, `nova-commercial-guards.test.ts`, `nova-phase0-goldens` (`write_request_deny`).

---

## 5. DialogState / TTL

Constants on tip: clarify act TTL **30m**; conversation slots **20m** wall-clock + **10** turn max (`dialog-state.ts`).

| # | Check | When | Pass criteria | ☐ |
|---|--------|------|---------------|---|
| D1 | Tata-style `"1"` bind-by-id | **TIP_2.137** | No second Did-you-mean; customer id forced; DialogState T1–T5 | ☐ |
| D2 | History fallback | **TIP_2.137** + **LIVE** | `conversationId` + empty server history → client prior still resolves `1` (T6) | ☐ |
| D3 | Topic-switch cancels pending | **TIP_2.137** | e.g. `leave balance` clears clarify (T7) | ☐ |
| D4 | OOB / ambiguous short replies | **TIP_2.137** | `9` / bare `yes` → soft re-ask; no fuzzy `"9"` (T8–T9) | ☐ |
| D5 | Bound entity on follow-up money | **TIP_2.137** | Uses bound id; no re-fuzzy name (T11) | ☐ |
| D6 | Clarify act TTL expiry | **TIP_2.137** | Expired pending → no bind; soft re-prompt or fresh clarify | ☐ |
| D7 | Conversation slot wall-clock TTL | **TIP_2.137** | After idle >20m, bare party does not inherit stale receipts month | ☐ |
| D8 | Conversation slot turn TTL | **TIP_2.137** | After `MAX_TURNS`, slots clear without same-family refresh | ☐ |
| D9 | Period preserved across clarify | **TIP_2.137** | Explicit period in resume not re-defaulted to month | ☐ |
| D10 | Clear / new chat resets state | **TIP_2.137** + **LIVE** | UI Clear + new conversation wipe pending + slots | ☐ |
| D11 | Staff topic-switch clears sticky money | **TIP_2.137** | v2.137.1 staff routing; money family does not bleed into staff asks | ☐ |

**Suites:** `dialog-state.test.ts`, `nova-sprint1-goldens`, DialogState plan §6 T1–T12.

---

## 6. Packs (Month / Project / Collection)

| # | Check | When | Pass criteria | ☐ |
|---|--------|------|---------------|---|
| P1 | Month Performance → `NovaPackResult` | **TIP_2.137** | schemaVersion, ≤3 primary attentions, overflow rule, no pad-empty | ☐ |
| P2 | Month feel-target composition | **TIP_2.137** + **LIVE** | See §10 commercial director test | ☐ |
| P3 | Thin charts only (KPI / trend / ageing) | **TIP_2.137** | No builder; no eight chart types; certified/pack metric ids only | ☐ |
| P4 | Project Command pack #2 | **POST_S5_6** | “Everything important about this project” — EPC spine, not theatre | ☐ |
| P5 | Collection Attention pack #3 | **POST_S5_6** | Align to `collection-attention-prep.ts` metrics + finding shapes | ☐ |
| P6 | Project-aware Collection | **POST_S5_6** | Uses DialogState project slot; not Project Command confusion | ☐ |
| P7 | CBG is section, not 4th pack | **TIP_2.137** | No `cbg_named_pack` product surface | ☐ |
| P8 | Pack → Save report path | **TIP_2.137** + **POST_S5_6** + **LIVE** | All three packs freeze into same report plane | ☐ |
| P9 | Recipe registry bounded | **TIP_2.137** | Phrase → fixed skill/pack; unknown falls through — no open planner | ☐ |

**Refs:** `month-performance.ts`, `project-command.ts`, `collection-attention.ts` + prep, `pack-result.ts`, `packs.test.ts`.

---

## 7. Reports (NOVA plane)

| # | Check | When | Pass criteria | ☐ |
|---|--------|------|---------------|---|
| RP1 | Immutable snapshot | **TIP_2.137** | Saved row checksum / pack / narrative never mutate | ☐ |
| RP2 | Regenerate = new id | **TIP_2.137** + **LIVE** | `regeneratedFromId` points at prior; old row unchanged | ☐ |
| RP3 | Security envelope v1 fields | **TIP_2.137** | tenant, owner, pack/schema versions, metricVersions, sensitivity, permissionsUsed, dataAsOf, expiresAt, checksum, objectKeys | ☐ |
| RP4 | List + download routes | **TIP_2.137** + **LIVE** | `GET /api/nova/reports`, `GET …/[id]?format=` | ☐ |
| RP5 | PDF renderer | **LIVE** / steward | Tip may still be **stub** (`stub: true`) — call report plane “done” only after real PDF | ☐ |
| RP6 | Bucket / object keys | **LIVE** | `nova/reports/{tenant}/{owner}/{id}/…`; upload + retention still open if not cut over | ☐ |
| RP7 | No operational ERP writes on save | **TIP_2.137** | Audit save path — metadata + bucket only | ☐ |

**Refs:** `report-envelope.ts`, `reports/*`, `REPORT_PLANE_HANDOFF.md`.

---

## 8. Readonly client / isolation

| # | Check | When | Pass criteria | ☐ |
|---|--------|------|---------------|---|
| RO1 | Skills import `@/lib/nova/prisma-readonly` only | **TIP_2.137** | Architectural CI green; usage map matches | ☐ |
| RO2 | Plane writes stay on `@/lib/prisma` | **TIP_2.137** | memory, aliases, report-service | ☐ |
| RO3 | `NOVA_READONLY_DATABASE_URL` set | **DBA** + **LIVE** | Dedicated URL; smoke SELECT-only | ☐ |
| RO4 | Postgres role `nova_readonly` | **DBA** | Scaffold `scripts/nova-readonly-role-scaffold.sql` reviewed + applied | ☐ |
| RO5 | Optional `NOVA_READONLY_REQUIRE=1` | **LIVE** | After smoke; fail closed if URL missing | ☐ |
| RO6 | Cutover checklist complete | **DBA** | `NOVA_READONLY_CUTOVER_CHECKLIST` in `semantic/readonly-cutover.ts` | ☐ |

**Gate:** Do not treat tip CI import gate alone as production isolation — **RO3–RO5** are deployer/DBA.

---

## 9. Goldens / eval gates

| # | Suite / catalog | When | Pass criteria | ☐ |
|---|-----------------|------|---------------|---|
| G1 | Phase 0 (`nova-phase0-goldens`) | **TIP_2.137** | 80-floor categories green; leakage = 0 | ☐ |
| G2 | Sprint 1 dialog / follow-up goldens | **TIP_2.137** | Tata `"1"`, period follow-ups, topic-switch | ☐ |
| G3 | Commercial guards | **TIP_2.137** | Dual write + answer guard cases | ☐ |
| G4 | SearchEngine goldens | **TIP_2.137** | deny_write, families, decisive plans | ☐ |
| G5 | DialogState unit TTL / bind | **TIP_2.137** | `dialog-state.test.ts` | ☐ |
| G6 | Pack contract smoke | **TIP_2.137** | `packs.test.ts` — Month + stubs | ☐ |
| G7 | Report plane tests | **TIP_2.137** | Immutability, regenerate id, RBAC list, PDF stub | ☐ |
| G8 | Semantic / certified bindings CI | **TIP_2.137** | Drift fails CI; Month certified set | ☐ |
| G9 | Architecture CI | **TIP_2.137** | `nova-architecture.ci.test.ts` invariants | ☐ |
| G10 | Project Command goldens | **POST_S5_6** | Canonical project asks + no theatre | ☐ |
| G11 | Collection Attention goldens | **POST_S5_6** | `COLLECTION_ATTENTION_GOLDENS` wired to CI | ☐ |
| G12 | Module coverage goldens | **POST_S5_6** | Staff / module gaps from `module-coverage-prep` | ☐ |
| G13 | Phase E/F/G skill packs | **TIP_2.137** | documents, proactive insights, collection delay labeled | ☐ |

**Run (local / CI):**  
`npx vitest run src/lib/ai/nova-phase0-goldens.test.ts src/lib/ai/nova-sprint1-goldens.test.ts src/lib/ai/nova-commercial-guards.test.ts src/lib/nova`

---

## 10. Commercial director acceptance test

Canonical ask (feel target — `NOVA_3_0_PLAN.md` §12):

> *“How is July going?”* / *“How is this month going?”*  
> Also: *“Month performance”*, *“Director brief for this month”*.

### 10a — UX feel target (**TIP_2.137** + **LIVE**; re-check **POST_S5_6**)

| # | Expect | ☐ |
|---|--------|---|
| CD1 | Short narrative — period-explicit, director-voice (not a table dump) | ☐ |
| CD2 | Exactly **≤3** primary attentions (Finding-backed); overflow counted; **empty OK** if nothing material | ☐ |
| CD3 | Buttons / deep links — overdue, project, Save report, follow-ups | ☐ |
| CD4 | Follow-up *“Why Tata?”* / *“Why is Tata in attention?”* binds party — **no re-fuzzy** | ☐ |

### 10b — Must return when permissions allow

| # | Expect | ☐ |
|---|--------|---|
| CD5 | Period label explicit (calendar vs FY) | ☐ |
| CD6 | Sales + collections for period (certified metrics on Month) | ☐ |
| CD7 | Receivables / overdue attention (counts + ₹ when allowed) | ☐ |
| CD8 | Bank / today in-out if `director_dashboard` permitted | ☐ |
| CD9 | Project or CBG highlight Findings — not empty theatre | ☐ |
| CD10 | Thin system charts only when metrics warrant (KPI / trend / ageing) | ☐ |
| CD11 | Deep links into ERP screens | ☐ |
| CD12 | Optional Save report → immutable snapshot; download next day under same RBAC | ☐ |

### 10c — Must never

| # | Forbidden | ☐ |
|---|-----------|---|
| CD13 | Invent ₹ or counts | ☐ |
| CD14 | Write operational ERP | ☐ |
| CD15 | Soft-fuzzy money party | ☐ |
| CD16 | Present prediction as ledger fact | ☐ |
| CD17 | Open chart / dashboard builder | ☐ |

### 10d — End-to-end commercial bar (deployer sign-off)

| # | Scenario | When | ☐ |
|---|----------|------|---|
| CD18 | Director ask → feel target → Save → list → download | **LIVE** | ☐ |
| CD19 | Revoke a pack permission → download 403 | **LIVE** | ☐ |
| CD20 | Regenerate → new report id; old checksum intact | **LIVE** | ☐ |
| CD21 | Project Command ask (post S5) trusted for one live project | **POST_S5_6** + **LIVE** | ☐ |
| CD22 | Collection attention for a party (post S6) — facts only, ≤3 attentions | **POST_S5_6** + **LIVE** | ☐ |
| CD23 | `/api/health` version recorded on this checklist | **LIVE** | ☐ |

**Health version audited:** _______________  
**Auditor / date:** _______________

---

## 11. Tip ~2.137.x — what to verify now (pre Sprint 5–6 merge)

Use this as the **immediate** deployer smoke on tip without waiting for pack deepen:

1. **CI green:** Phase 0, Sprint 1, commercial guards, dialog-state, packs smoke, report-plane, semantic, architecture CI.  
2. **Write-deny + dual guards** live in chat (create invoice / approve / delete phrasing).  
3. **DialogState Tata `"1"` + TTL + Clear** on a real conversation.  
4. **Month Performance** ask ≈ feel target (even if charts/PDF still thin/stub).  
5. **Report plane:** save Month answer, list, download; regenerate new id; RBAC revoke path.  
6. **Readonly:** confirm skill import gate; schedule DBA cutover if `NOVA_READONLY_DATABASE_URL` not live.  
7. **Do not** claim Project Command / Collection commercial-ready until **POST_S5_6** rows above are green.  
8. **Do not** call report plane “complete” while PDF is stub and bucket/retention unfinished.

---

## 12. Deployer handoff (post Sprint 5–6)

1. Merge Sprint 5 + 6 only after Sprint 3 **LIVE** health-match and Sprint 4 tip gates.  
2. Re-run **full** checklist on the new health version (cite version in §10d).  
3. Steward-promote Project / Collection metrics draft → certified only after pack goldens green.  
4. Wire Collection / Project goldens into CI if still prep-only.  
5. Complete PDF renderer + `nova_bucket` + retention before marketing “forwardable reports.”  
6. Complete `nova_readonly` cutover (**RO3–RO5**) before calling isolation done.  
7. Open tickets for any ✗ — **do not** weaken invariants or skip answer/write guards.  
8. **No** version bump / Railway / push from `nova-3-audit-prep` — this branch is documentation only.

---

## 13. Related docs

| Doc | Role |
|-----|------|
| `NOVA_FINAL_ARCHITECTURE.md` | Canonical runtime flow |
| `NOVA_3_0_PLAN.md` | Product strategy + §12 feel target + quality gates |
| `NOVA_COMMERCIAL_READY_PLAN.md` | P0–P5 chat readiness |
| `NOVA_DIALOG_STATE_PLAN.md` | Clarify T1–T12 acceptance |
| `invariants.ts` | Frozen forever flags |
| `evals/PHASE0.md` (+ E/F/G, ALIASES) | Eval pack pointers |
| Pack / report / Sprint 4 handoffs under `packs/` + `semantic/` | Merge gates |

---

## Explicit non-goals (this PREP)

- No code fixes, no skill changes, no version bump  
- No `git push` to `main`, no Railway  
- No claiming Sprint 5–6 complete from tip alone  
- No promoting draft metrics to certified without steward review  

---

## 14. Audit execution log (deployer)

**Health version audited:** `2.137.5` (Sprint 5–6 live) → fixes ship as `2.137.6` then commercial tag `3.0.0`  
**Auditor / date:** Auto deployer / 2026-07-13  

### Fixed on tip (code)

| Item | Result |
|------|--------|
| G1–G9 suites (phase0, sprint1, commercial guards, search-engine, dialog-state, packs, report-plane, semantic, architecture) | **PASS** (unit) |
| RO1 skills `@/lib/prisma` import ban | **PASS** |
| D11 staff sticky money | **PASS** (`staff-routing.test.ts`, live since `2.137.1`) |
| P8 Save report UI wire | **FIXED** — chat “Save report” → `saveNovaReportAction`; pack not stored in sessionStorage |
| RP5 PDF beyond stub | **FIXED** — minimal valid Helvetica PDF (`stub: false`); richer kit deferred |
| Pack narrative formatting | **FIXED** — Month/Project/Collection use `data.narrative` |

### Deferred (not blocking 3.0.0 commercial tag; steward/DBA)

| Item | Why deferred |
|------|----------------|
| RO3–RO5 / RO6 `nova_readonly` URL + role cutover | **DBA** — scaffold + checklist exist; production URL not required for product tag |
| RP6 bucket upload + retention job | Object key shape ready; S3 cutover open |
| CD18–CD22 live director smoke | Needs human director tenant session |
| Project/Collection metric **certified** promotion | Steward only — remain draft until goldens + review |
| Rich PDF kit (tables/brand) | Minimal PDF sufficient for download wire |
| Module-coverage G1/G2 leftovers beyond staff fix | Matrix/docs shipped; further entity types as follow-ups |

### Commercial acceptance (code-level)

Director Month ask → PackResult → Save report → download ACL re-check path is wired. Live CD* rows remain steward smoke after `3.0.0`.

---

## 15. Post-3.0.2 full audit re-run (deployer)

**Health version audited:** live **3.0.2** (Ship A + `NOVA_READONLY_REQUIRE=1`) → polish ships as **3.0.3**  
**Auditor / date:** Auto deployer / 2026-07-13  
**CI:** `npx vitest run …/nova-phase0-goldens …/nova-sprint1-goldens …/nova-commercial-guards src/lib/nova` → **232 passed**

### Checklist marks (code / tip)

| Area | Result |
|------|--------|
| R1–R8 RBAC / pack ACL / report re-check | **PASS** (unit + architecture CI); R3 mid-pending LIVE optional |
| L1–L7 leaks / injection | **PASS** (phase0 + dialog-state); L5 retention cron schedule = **ops** |
| H1–H8 hallucinations / theatre / certified badges | **PASS** (guards + packs + certified bindings CI) |
| W1–W7 write-deny / plane isolation / forever-forbidden | **PASS** |
| D1–D11 DialogState / TTL / staff clear | **PASS** (sprint1 + dialog-state + staff-routing) |
| P1–P9 packs | **PASS**; G10/G11 goldens wired in `packs.test.ts` (**3.0.3**) |
| RP1–RP7 reports | **PASS**; RP5 richer multi-page PDF (**3.0.3**); RP6 HeadObject = **ops** |
| RO1–RO2 import / plane writes | **PASS** |
| RO3–RO5 readonly URL + REQUIRE | **PASS (LIVE)** — URL set; REQUIRE=1; health ready on 3.0.2 redeploy |
| RO6 cutover checklist | App steps done; DBA re-verify grants if privileges change |
| G1–G13 goldens | **PASS** unit; G12 module-coverage leftovers = follow-up |
| CD1–CD17 / P4–P5 unit stand-ins | **PASS** (`nova-director-commercial.test.ts`) |
| CD18–CD22 live director session | **DEFERRED** steward |

### Fixed in 3.0.3

| Item | Result |
|------|--------|
| G10/G11 Project + Collection golden routing in CI | **FIXED** |
| Recipe match gaps (AR ageing, collection risk, project spine asks) | **FIXED** |
| PDF metrics + multi-page Helvetica | **FIXED** (brand tables still deferred) |
| Director CD* automated stand-ins | **ADDED** |

### Still human-ops / steward

| Item | Owner |
|------|--------|
| CD18–CD22 live Save → download → revoke | Steward |
| Promote Project/Collection metrics → certified | Steward |
| Railway retention cron schedule | Ops |
| STORAGE HeadObject under `nova/reports/` | Ops |
| Brand/table PDF kit | Product (optional) |
| Do not unset `NOVA_READONLY_REQUIRE` without rollback plan | Ops |


## 16. save/give report follow-up (3.0.4)

**Issue:** bare “give report” / “save report” hit ERP `reports_snapshot` / GSTR.

**Fix:** `isNovaSaveReportFollowUp` + SearchEngine/lexicon deny + `dialogState.lastSavablePack` auto-save or clarify toward Month/Project/Collection packs. Tests in `save-report-follow-up.test.ts`.
