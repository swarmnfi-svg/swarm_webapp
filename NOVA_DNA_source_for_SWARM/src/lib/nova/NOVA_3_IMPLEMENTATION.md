# NOVA 3 — Implemented Details

**Tip (repo):** `package.json` **3.0.10**  
**Live (`https://erp.empowerbpg.com/api/health`):** **3.0.9** SearchEngine who-is / cross-module (confirm **3.0.10** after this deploy)  
**Baseline before 3.0 path:** **2.136.7** (slot TTL + topic-switch)  
**Canonical docs:** [`NOVA_3_0_PLAN.md`](./NOVA_3_0_PLAN.md) · [`NOVA_FINAL_ARCHITECTURE.md`](./NOVA_FINAL_ARCHITECTURE.md) · [`NOVA_FULL_AUDIT_CHECKLIST.md`](./NOVA_FULL_AUDIT_CHECKLIST.md) · [`NOVA_OPS_CUTOVER.md`](./NOVA_OPS_CUTOVER.md)

---

## 1. What NOVA 3 is

**Positioning (frozen):** *Trusted operational brain for project/EPC/CBG SMEs — private reports on its own plane — never changes the ERP.*

NOVA 3 is **not** a BI suite. It is controlled ERP intelligence:

1. Ask in natural language  
2. Rules-first plan over **catalog skills only** (RBAC + read-only)  
3. Evidence-backed **Finding** → guarded narration  
4. Optional **immutable snapshot report** (NOVA plane only)  
5. Thin **system-selected** charts bound to pack/certified metrics  

### Invariants (`invariants.ts` / `NOVA_INVARIANTS`)

| Freeze forever | Meaning |
|----------------|---------|
| Never write operational ERP | Skills SELECT only; dual write guards |
| Catalog skills only | No free SQL, no LLM tool pick |
| Rules-first + gated Think | SearchEngine default; Think only on low confidence |
| Dual guards + RBAC + clarify + answer guards | Money/count/identity/period cannot invent |
| NOVA plane writes only | Chat, dialogState, aliases, findings, reports |
| Reports immutable | Regenerate = new report id |
| Forever forbidden | Dashboard builder, process mining, forecast product, CBG as 4th pack, ERP writeback, sticky ₹ memory, unrestricted ledger export |

---

## 2. Architecture flow

Full mermaid + layer table: **[`NOVA_FINAL_ARCHITECTURE.md`](./NOVA_FINAL_ARCHITECTURE.md)**.

**Short path:**

```
UI (NovaAiChat / Bubble)
  → askNovaAiAction (session · ai.assistant.read · quota)
  → Load NovaDialogState (+ history fallback)
  → Pending ClarifyAct? → bind-by-id / re-ask / topic-switch cancel
  → inferNovaQuery → SearchEngine (rules) → Think iff low confidence
  → Plan + recipes → dual write guards → RBAC → entity resolve
  → Skills (prisma-readonly) → facts → NovaFinding → narrate → answer guards
  → Persist T0–T2 dialog memory
  → Optional Save report → NovaReport envelope + packSnapshot → download ACL re-check
  → My reports UI → list / format download / regenerate / delete
```

**Planes:**

| Plane | Role |
|-------|------|
| **empower_app_db** | Operational ledger — skill **reads** only |
| **nova_system** (same DB today) | `NovaConversation`, `dialogState`, aliases, `NovaReport` |
| **nova_bucket / prefix** | Object keys `nova/reports/{tenant}/{owner}/{id}/…` — best-effort upload when `STORAGE_*` set; retention cron available |

---

## 3. Sprint map (0–6) + post-tag

| Sprint | Goal | What landed | Key files | Version(s) |
|--------|------|-------------|-----------|------------|
| **0** | Invariant freeze + readonly scaffold | `NOVA_INVARIANTS`, architectural CI, `prisma-readonly` client, SQL role scaffold | `invariants.ts`, `prisma-readonly.ts`, `nova-architecture.ci.test.ts`, `scripts/nova-readonly-role-scaffold.sql` | Scaffold in **2.137.0** |
| **1** | Conversational excellence | DialogState bind-by-id, dual write + answer guards (pre-3.0), slot TTL 20m / 10 turns, topic-switch clear, period preserve, Clear resets, Sprint 1 goldens | `dialog-state.ts`, `nova-sprint1-goldens`, commercial guards | **2.136.4–2.136.7** (+ **2.137.1** staff routing) |
| **2** | Director Month Performance + thin charts | Bounded recipe → `NovaPackResult`; ≤3 attentions; KPI + trend + ageing charts; CBG as section | `packs/month-performance.ts`, `pack-result.ts`, registry `month_performance` | **2.137.0** |
| **3** | Report plane v1 | `NovaReport` model, security envelope, save / list / download / regenerate, checksum freeze, PDF/CSV/text, RBAC re-check | `report-envelope.ts`, `reports/*`, `api/nova/reports/*`, Prisma `NovaReport` | **2.137.2** (audit PDF: **2.137.6**) |
| **4** | Certified metrics + readonly cutover prep | Full contract bindings; Month = **certified**; Project/Collection = **draft**; cutover checklist + usage map | `semantic/certified-bindings.ts`, `semantic/readonly-cutover.ts`, `SPRINT4_METRICS_HANDOFF.md` | **2.137.3** |
| **5** | Project Command pack #2 | EPC spine fan-out (tasks/SO/PO/delivery/sales/receipts/overdue); no health-score theatre; prep contract + live runner | `packs/project-command.ts`, `project-command-prep.ts` | **2.137.4** |
| **6** | Collection Attention pack #3 | Named pack wrapping collection recipe → `NovaPackResult`; ≤3 attentions; ageing chart binding | `packs/collection-attention.ts`, `collection-attention-prep.ts` | **2.137.5** |
| **Audit → tag** | Commercial checklist green (code) | Save report UI, minimal Helvetica PDF (`stub: false`), pack `data.narrative`, audit log | `nova-ai-chat.tsx`, `render-artifacts.ts`, `NOVA_FULL_AUDIT_CHECKLIST.md` §14 | **2.137.6** → **3.0.0** |
| **Post-tag product** | My reports + harden plane | My reports UI; regenerate = new id; pack RBAC `permissionsUsed`; format picker; best-effort bucket upload; retention cron | `nova-my-reports.tsx`, `permissions-snapshot.ts`, `artifact-storage.ts`, `retention.ts`, ops `NOVA_OPS_CUTOVER.md` | **3.0.1** |
| **Ship A (security)** | Storage ACL + doc ACL | Path ACL for uploads, tar restore preflight, document ACL MVP, receipt test mocks | `uploads.ts`, `document-access.ts`, `complete-restore.ts` | **3.0.2** |
| **Audit polish** | Goldens + richer PDF + director unit CD* | Pack golden routing CI; multi-page PDF with metrics; `nova-director-commercial.test.ts` | `packs.test.ts`, `render-artifacts.ts`, audit §15 | **3.0.3** |
| **Save-report UX** | Chat “give/save report” | Dialog `lastSavablePack`; never ERP `reports_snapshot` | `save-report-follow-up.ts` | **3.0.4** |

---

## 4. Version timeline (2.136.7 → tip)

| Version | One-line |
|---------|----------|
| **2.136.7** | Conversation slot TTL + topic-switch clear |
| **2.137.0** | NOVA 3.0 Sprints 0–6 scaffold — packs, report plane, readonly client |
| **2.137.1** | Staff profile routing — clear sticky money on staff asks |
| **2.137.2** | Sprint 3 report plane merge (snapshot, list RBAC, PDF stub era) |
| **2.137.3** | Sprint 4 certified Month metrics + readonly cutover notes |
| **2.137.4** | Sprint 5 Project Command prep/merge |
| **2.137.5** | Sprint 6 Collection Attention prep/merge |
| **2.137.6** | Audit fixes — Save report UI, minimal PDF, pack narrative |
| **3.0.0** | Commercial release tag — packs, report plane, audit green |
| **3.0.1** | My reports UI, pack RBAC snapshot, regenerate/delete, format picker, artifact upload + retention cron |
| **3.0.2** | Ship A security — storage path ACL, tar preflight, document ACL MVP |
| **3.0.3** | Audit polish — pack goldens in CI, richer multi-page PDF, director CD* unit suite |
| **3.0.4** | save/give report follow-up — NOVA pack save, not ERP reports_snapshot |
| **3.0.5** | Richer NOVA report PDFs (jsPDF sections/tables) |
| **3.0.6** | **Live runners** Attendance Month (`attendance_month`) + Cash/Banking (`cash_banking`) — not PREP-only |
| **3.0.7** | Presentation polish — `deterministic_polished` / `hybrid_guarded`; attendance jargon; sales/receipts/tasks/bank/approvals formatters |
| **3.0.8** | Tasks chapter deepen (Project Command) + Customer master chapter on Collection Attention; prep contracts |
| **3.0.9** | SearchEngine brain — who-is, find/what, cross-module resolve |
| **3.0.10** | Tasks/customer routing leftovers + polished `customers_summary` (named `tasks_light` still deferred) |

Earlier foundation (still relevant, pre-2.136.7): SearchEngine + gated Think (2.136.1), DialogState (2.136.4), dual write/answer guards (2.136.5), Phase F/G insights + labeled delay prediction (2.136.2–2.136.3), Phase A metrics/aliases (2.135.x).

---

## 5. Packs

Common schema: **`NovaPackResult`** (`pack-result.ts`) — `schemaVersion`, `packId`, `period` (explicit calendar vs FY), `metrics[]`, `facts`, `findings`, `attentions` (≤3 primary + `overflowCount`), `charts` (`kpi_strip` \| `period_trend` \| `ageing_or_attention`), `links`, `warnings`, `omittedNotes`, `narrativeHints`.

**Attentions rule:** `selectNovaPackAttentions` — up to **`NOVA_MONTH_ATTENTION_PRIMARY_MAX = 3`**; if nothing material → empty primary (no theatre padding).

### Month Performance (`month_performance` · pack v1.0.0)

| | |
|--|--|
| **Ask** | “How is this month going?”, “How is July going?”, “Month performance”, “Director brief for this month” |
| **Tools** | sales, receipts, overdue, receivables, director dashboard, bank, projects, CBG quotations |
| **Charts** | KPI strip; sales vs collections trend; AR ageing/attention |
| **CBG** | Section inside Month — **not** a fourth named pack |
| **File** | `packs/month-performance.ts` |

### Project Command (`project_command` · pack v1.0.0)

| | |
|--|--|
| **Ask** | “Tell me everything important about this project”, “Project Command for …”, “project deep dive” |
| **Spine** | projects, tasks, SO, PO, delivery, sales, receipts, overdue |
| **Tasks chapter (3.0.8+)** | Open + overdue + due-soon + completed from `tasks_summary`; project-scoped task phrases route to Project Command (**3.0.10**; named `tasks_light` pack deferred) |
| **Rule** | Needs resolved project; will **not** invent EPC health scores |
| **Metrics** | Draft until steward promotion (`listDraftProjectBindings`) |
| **File** | `packs/project-command.ts` (+ `tasks-light-prep.ts` contract) |

### Collection Attention (`collection_attention` · pack v1.0.0)

| | |
|--|--|
| **Ask** | “Collection attention for …”, outstanding/overdue focus |
| **Shape** | Wraps existing collection recipe → `NovaPackResult` |
| **Customer chapter (3.0.8+)** | `customers_summary` master headcount beside AR; customer context/master phrases → Collection (**3.0.10**) — **not** a fourth named pack |
| **Charts** | `ageing_or_attention` from primary attentions |
| **Metrics** | Draft (`customers.*`, `ar.customer_outstanding`, overdue count, receipts) |
| **File** | `packs/collection-attention.ts` (+ `customer-chapter-prep.ts`) |

### Attendance Month (`attendance_month` · pack v1.0.0 · **3.0.6 live runner**)

| | |
|--|--|
| **Ask** | “How is this month’s attendance?”, “attendance this month” |
| **Tools** | attendance_late_summary (overview) + leave/reg/OT as permitted |
| **File** | `packs/attendance-month.ts` (+ prep) |

### Cash / Banking (`cash_banking` · pack v1.0.0 · **3.0.6 live runner**)

| | |
|--|--|
| **Ask** | “How is cash?”, “bank balances”, “cash and banking” |
| **Tools** | bank accounts, receipts, recon, payment requests |
| **File** | `packs/cash-banking.ts` (+ prep) |

Also still registered (thinner): `project_health`, `cbg_pipeline` — CBG remains a **section**, not pack #4.

**Presentation (3.0.7–3.0.10):** `src/lib/ai/nova-presentation.ts` + `src/lib/nova/presentation/` — facts deterministic; queues `deterministic_polished`; summaries `hybrid_guarded` → polished fallback; customers master card in **3.0.10**.

**Goldens in CI:** `PROJECT_COMMAND_GOLDENS` / `COLLECTION_ATTENTION_GOLDENS` / attendance+cash / tasks+customer prep goldens in `packs.test.ts`.

---

## 6. Report plane

| Piece | Implementation |
|-------|----------------|
| **Model** | Prisma `NovaReport` — `envelope`, `packSnapshot`, `narrative`, `checksum`, `objectKeys`, `regeneratedFromId`; **no `updatedAt`** on snapshot fields |
| **Envelope** | `NovaReportSecurityEnvelope` — tenant, owner, pack versions, `metricVersions`, sensitivity, `permissionsUsed`, `dataAsOf`, `expiresAt`, checksum, objectKeys |
| **permissionsUsed** | Pack RBAC witness snapshot at save (`permissions-snapshot.ts`) — not only `ai.assistant.read` |
| **Immutability** | Checksum of frozen pack; regenerate → **new cuid** + `regeneratedFromId` |
| **Retention** | Default **90** days; sensitive/restricted capped **≤30**; cron `POST /api/nova/reports/cron` |
| **Artifacts** | Text + CSV production-usable; PDF = **multi-page Helvetica** with metrics + attentions (`stub: false`) — brand/kit tables still deferred |
| **Object storage** | Best-effort upload when `STORAGE_*` configured; DB remains source of truth |
| **APIs** | `GET /api/nova/reports`, `GET/DELETE /api/nova/reports/[id]?format=`, `POST …/regenerate`, cron |
| **RBAC** | `recheckNovaReportPermissions` on download/list — **current** perms, not save-time only |
| **UI** | Chat **Save report** + **My reports** (list, format picker, regenerate, delete) |

**Include in snapshot:** fact digests, metric versions, findings/attentions, chart datasets, guarded narrative, provenance as-of.  
**Exclude:** full ledger dumps, mutable live embeds, salary/bank identifiers in long-lived bodies.

### Gaps (honest)

- Brand / table PDF kit still deferred (multi-page metrics PDF shipped in **3.0.3**)  
- Live director CD18–CD22 smoke still steward/human (unit stand-ins in `nova-director-commercial.test.ts`)  
- Railway cron schedule for report retention = **ops** (route ready)  
- Confirm `STORAGE_*` HeadObject under `nova/reports/` = **ops**  

---

## 7. Readonly / metrics

### Readonly

- Skills import **`@/lib/nova/prisma-readonly`** only (CI-enforced).  
- Prefers env **`NOVA_READONLY_DATABASE_URL`**; falls back to `DATABASE_URL` until DBA cutover.  
- Optional **`NOVA_READONLY_REQUIRE=1`** fails closed in production if dedicated URL missing.  
- Plane writes (`memory`, aliases, `report-service`) stay on **`@/lib/prisma`**.  
- Checklist: `semantic/readonly-cutover.ts` · scaffold: `scripts/nova-readonly-role-scaffold.sql` · ops: **`NOVA_OPS_CUTOVER.md`**.

**Status (prod as of 3.0.2 redeploy):** `NOVA_READONLY_DATABASE_URL` set; **`NOVA_READONLY_REQUIRE=1`** set; health stayed ready. App lane + import gate **done**. Physical role grants remain DBA-owned if privileges drift.

### Certified metrics (Sprint 4)

| Pack | Certification |
|------|-----------------|
| Month Performance (8 ids incl. sales, receipts, AR, projects, CBG, order book) | **`certified`** |
| Project Command | **`draft`** until steward |
| Collection Attention | **`draft`** until steward |

CI: `assertCertifiedBindingsAgainstDictionary` — drift / missing contract fields fail.

---

## 8. Conversational

| Piece | Behavior |
|-------|----------|
| **SearchEngine** | Rules-first → slots; always backstop |
| **Think** | LLM slot fill **only** when plan confidence low; `validateNovaSearchSlots` drops invents |
| **DialogState** | Pending `ClarifyAct` bind-by-id (`"1"` / code / label); bound entity skips re-fuzzy |
| **Clarify TTL** | **30 minutes** (`NOVA_CLARIFY_ACT_TTL_MS`) |
| **Slot TTL** | **20 minutes** wall-clock + **10** turns (`NOVA_CONVERSATION_SLOT_*`) |
| **Topic switch** | Cancels pending clarify; clears sticky money family on staff asks (**2.137.1**) |
| **Memory** | T0–T2 only (pending acts, session slots, redacted turns) — **no** sticky ₹ RAG |
| **Staff routing** | Staff profile asks clear money-bound slots (`staff-routing.test.ts`) |

---

## 9. Audit (before 3.0.0 + post 3.0.3)

Source: `NOVA_FULL_AUDIT_CHECKLIST.md` §14–§15.

**Code-level PASS:** Phase 0 / Sprint 1 / commercial guards / SearchEngine / dialog-state / packs / report-plane / semantic / architecture CI; skills `@/lib/prisma` ban; staff sticky-money routing; G10/G11 pack goldens wired; director CD* unit suite.

**Deferred (not blocking):** Live CD18–CD22 human session; Project/Collection metric **certified** promotion; brand PDF kit; module-coverage entity follow-ups; retention cron schedule; storage HeadObject smoke.

---

## 10. Still open / human-ops deferred

| Item | Owner | Notes |
|------|-------|-------|
| Steward-promote Project/Collection metrics → certified | Steward | After pack goldens + review |
| Live CD18–CD22 director acceptance (Save → download → revoke 403) | Steward | Needs real tenant session |
| Schedule report retention cron on Railway | Ops | Route live; optional `NOVA_REPORTS_CRON_SECRET` |
| Confirm `STORAGE_*` → objects under `nova/reports/` | Ops | Upload best-effort; smoke HeadObject |
| Brand / table PDF kit | Product | Multi-page metrics PDF in **3.0.3**; richer kit optional |
| Watch / Pulse-lite | Later | Post-90 optional; not in 3.0.x |
| Physical `nova` schema / DB split | Later | Same DB + table discipline today |
| Re-verify `nova_readonly` grants if Postgres privileges change | DBA | REQUIRE=1 already on; do not unset blindly |

---

## 11. How to use

### Example director queries

| Intent | Example |
|--------|---------|
| Month pack | *How is this month going?* / *How is July going?* / *Month performance* |
| Follow-up | After month attentions: *Why Tata?* / *Why is Tata in attention?* (binds party — no re-fuzzy) |
| Project pack | *Tell me everything important about this project* / *Project Command for Avaada plant* |
| Collection pack | *Collection attention for Tata* / *Outstanding and overdue for …* |
| Write deny (must refuse) | *Create an invoice for …* / *Approve this payment* → use ERP screens |

### Save + My reports

1. Run a pack ask (Month / Project / Collection) until you get a pack-backed answer.  
2. Click **Save report** in NOVA AI chat → `saveNovaReportAction` freezes `NovaPackResult` + narrative with pack RBAC witnesses.  
3. Open **My reports** in the chat header — list, format picker (text / CSV / PDF), regenerate, delete.  
4. Or `GET /api/nova/reports` / `GET /api/nova/reports/{id}?format=pdf|csv|txt`.  
5. Revoked permission → download denied (RBAC re-check).  
6. **Regenerate** → new id + `regeneratedFromId`; old snapshot stays immutable.  
7. **Delete** removes the NOVA report only (never ERP data).

---

## Related paths (quick index)

| Area | Paths |
|------|--------|
| Packs | `src/lib/nova/packs/*.ts` |
| Pack schema | `src/lib/nova/pack-result.ts` |
| Reports | `src/lib/nova/reports/*`, `src/lib/nova/report-envelope.ts` |
| My reports UI | `src/components/nova-my-reports.tsx`, `nova-ai-chat.tsx` |
| Ops cutover | `src/lib/nova/NOVA_OPS_CUTOVER.md` |
| Skills registry | `src/lib/nova/skills/registry.ts` |
| Metrics / certified | `src/lib/nova/semantic/metrics.ts`, `certified-bindings.ts` |
| Dialog | `src/lib/nova/dialog-state.ts` |
| Director unit CD* | `src/lib/nova/nova-director-commercial.test.ts` |
| Prisma | `NovaConversation`, `NovaMessage`, `NovaEntityAlias`, `NovaReport` in `prisma/schema.prisma` |
| UI | `src/components/nova-ai-chat.tsx`, `src/app/(app)/ai-assistant/actions.ts` |

---

*Generated from tip **3.0.4** code. Do not invent features beyond verified files.*
