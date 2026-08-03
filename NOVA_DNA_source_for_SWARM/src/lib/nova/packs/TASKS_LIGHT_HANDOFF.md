# Tasks chapter / light pack — PREP HANDOFF

**Branch:** `nova-tasks-customer-prep` only  
**Status:** PREP (contract + stub + phrases + goldens) — **not** merge-ready to `main`  
**Pack id:** `tasks_light` (or Project Command Tasks chapter deepen — see ship options)

---

## Dependency gate (blocking)

| Depends on | Why | Gate |
|------------|-----|------|
| **Presentation polish live** | Tasks answers / Project Command chapter narration should use polished `tasks_summary` formatters (`hybrid_guarded` / deterministic fallback). | **REQUIRED** — do **not** merge until the **sole deployer confirms health-match** on the live version that includes presentation polish, then pulls this prep. |
| **Project Command pack #2** | Tasks chapter deepen lives on the EPC spine (`tasks_summary` already in fan-out). | REQUIRED (on tip). |
| **Save / give report follow-up** | If shipped as named pack, Save report must freeze `NovaPackResult` — never ERP Reports. | REQUIRED when `shipAs=named_pack` (on tip). |
| **Certified ops metrics** | New draft `tasks.overdue` / `tasks.due_soon` / `tasks.completed_period` need dictionary + drift; `tasks.open` + `my_work.summary` already exist. | IDEAL. |

**Hard rule:** No `git push` to `main`, no Railway, **no version bump** from this prep.

---

## Ship options (implementer / deployer choice)

| Option | When | Save report |
|--------|------|-------------|
| **`project_chapter`** (preferred default) | Deepen Project Command Tasks chapter with overdue / due-soon / completed shapes | No new pack id; metrics reuse Project Command |
| **`named_pack`** (`tasks_light`) | Directors ask my/team/overdue tasks as a first-class savable brief | Yes — add to `NOVA_SAVEABLE_PACK_IDS` |

PREP freezes **both**: stub uses pack id `tasks_light`; narrativeHints record `shipAs`. Prefer **project_chapter** so Project Command stays the EPC home; ship named pack only when “my overdue tasks” should be independently savable.

---

## Pack / chapter contract (frozen in PREP)

| Field | Value |
|-------|--------|
| **Pack id** | `tasks_light` (`NovaPackId`) when named |
| **Prep module** | `src/lib/nova/packs/tasks-light-prep.ts` |
| **Live runner** | *none yet* — deepen `project-command.ts` Tasks chapter and/or add `tasks-light.ts` |
| **Stub builder** | `buildTasksLightPackStub()` → `NovaPackResult` |
| **Signature asks** | *“my overdue tasks”* (light) · *“open tasks on this project”* (chapter) |
| **Attentions** | ≤ 3 primary via `selectTasksLightAttentions`; empty if nothing material |

### Questions

See `TASKS_LIGHT_QUESTIONS` — overdue, project-scoped, team week, person, due soon.

### Metrics (draft)

| Family | Metric id(s) | Notes |
|--------|----------------|-------|
| Open | `tasks.open` | Shared with Project Command |
| Overdue | `tasks.overdue` | New draft from overdueCount |
| Due soon | `tasks.due_soon` | New draft (7-day window) |
| Completed | `tasks.completed_period` | New draft + period label |
| My work | `my_work.summary` | Light pack self only — not Project Command spine |

Stub: `certification: "draft"`, `value: null`. Fill from `tasks_summary` / `my_work_summary` facts only — never invent overload scores.

### RBAC

See `TASKS_LIGHT_RBAC`:

| Concern | Permission(s) |
|---------|----------------|
| Open chapter / pack | any of `task.read.self` \| `task.edit.team` \| `task.admin` |
| Self-only | `task.read.self` alone — own tasks only |
| Team / other person | `task.edit.team` or `task.admin` per skill |
| My work chapter | `task.read.self` (+ kpi/leave as skill) |

**Rules:**

1. Missing all task gates → omit chapter (`permission_omission`); no invented counts.  
2. Project-scoped → keep project-filtered totals; never coerce to org-wide.  
3. Save report `permissionsUsed` must include every chapter that contributed facts; download ACL re-check.  
4. NOVA never creates / assigns tasks (read-only).

### Finding shapes

See `TASKS_LIGHT_FINDING_SHAPES` — scope/permission gap, open load, overdue/due-soon material, completed, my-work (light only), quiet.

`PROJECT_COMMAND_TASKS_CHAPTER_SHAPES` = shapes excluding `lightPackOnly` — map into Project Command Tasks chapter.

### Chapters / tools

`tasks_summary`, `my_work_summary` (optional, named pack self brief only).

### Charts (thin)

- `kpi_strip` ← open / overdue / due soon  
- `ageing_or_attention` ← overdue + due soon  

---

## Goldens

`TASKS_LIGHT_GOLDENS` — signature overdue, project-scoped → Project Command, team week, person thin skill, my work thin, bare → clarify, no overload theatre.

Wire into CI when routing lands; if `project_chapter` only, goldens may expect `project_command` for project-scoped asks and `skill:tasks_summary` for thin Q&A.

---

## Implementer checklist (post–presentation polish health-match)

1. Deployer: health-match presentation polish live; pull this branch.  
2. Choose `project_chapter` vs `named_pack`; document in release notes.  
3. Deepen `project-command.ts` Tasks chapter with overdue / due-soon / completed shapes (reuse metric ids).  
4. If named pack: recipe + runner + `NOVA_SAVEABLE_PACK_IDS` + Save button title.  
5. Add draft metrics to dictionary (`tasks.overdue`, `tasks.due_soon`, `tasks.completed_period`); reuse `tasks.open` + `my_work.summary`.  
6. RBAC smoke: self-only vs team; projectScoped never org-wide.  
7. Goldens in CI; keep Project Command signature distinct from light pack.  
8. No version bump in prep — deployer owns semver when shipping.

---

## Explicit non-goals (this PREP)

- No version bump, no Railway, no push/merge to `main`
- No inventing overload / health scores
- No ERP task writes / assignments
- No CBG-as-fourth-pack product surface
- No replacing Project Command with a tasks-only pack for “everything important about this project”

---

## Files in this PREP

- `src/lib/nova/packs/tasks-light-prep.ts`
- `src/lib/nova/packs/TASKS_LIGHT_HANDOFF.md` — this document
- `src/lib/nova/pack-result.ts` — `NovaPackId` includes `tasks_light`
- `src/lib/nova/packs/packs.test.ts` — stub + RBAC + golden smoke
