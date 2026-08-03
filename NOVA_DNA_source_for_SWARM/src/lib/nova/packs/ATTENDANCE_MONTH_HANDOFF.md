# Attendance Month — PREP HANDOFF

**Branch:** `nova-attendance-cash-prep` only  
**Status:** PREP (contract + stub + phrases + goldens) — **not** merge-ready to `main`  
**Pack id:** `attendance_month`

---

## Dependency gate (blocking)

| Depends on | Why | Gate |
|------------|-----|------|
| **Save / give report follow-up live** | Pack answers must use the same Save report path as Month / Project / Collection — never ERP `reports_snapshot`. Tip includes `save-report-follow-up.ts` (v3.0.4+). | **REQUIRED** — do **not** merge until the **sole deployer confirms health-match** on the live version that includes the save-report fix, then pulls this prep. |
| **Report plane (Sprint 3)** | Immutable `NovaReport` snapshots + download ACL re-check. | REQUIRED (already on tip). |
| **Certified HR metrics (Sprint 4+)** | New draft ids (`attendance.late_count`, `present_days`, `absent_days`, `top_late`) need dictionary + drift checks before certification. `attendance.period_overview` already exists (`hr_sensitive`). | IDEAL — ship draft refs first. |

**Hard rule:** No `git push` to `main`, no Railway, **no version bump** from this prep. Merge only when deployer pulls after save-report fix is live.

---

## Pack contract (frozen in PREP)

| Field | Value |
|-------|--------|
| **Pack id** | `attendance_month` (`NovaPackId`) |
| **Prep module** | `src/lib/nova/packs/attendance-month-prep.ts` |
| **Live runner** | *none yet* — implementer adds `attendance-month.ts` + recipe registry after gate |
| **Stub builder** | `buildAttendanceMonthPackStub()` → `NovaPackResult` |
| **Signature ask** | *“how is this month’s attendance?”* / *“how is this month attendance”* |
| **Attentions** | ≤ 3 primary via `selectAttendanceMonthAttentions`; empty if nothing material |

### Questions / phrases

See `ATTENDANCE_MONTH_QUESTIONS` — month overview, late/absent month, named calendar month.

### Metrics (draft)

| Family | Metric id(s) |
|--------|----------------|
| Overview | `attendance.period_overview` |
| Late | `attendance.late_count` |
| Present | `attendance.present_days` |
| Absent | `attendance.absent_days` |
| Top late | `attendance.top_late` |
| Optional | `leave.summary`, `regularisation.pending`, `overtime.pending` |

Stub emits `certification: "draft"`, `value: null`. Fill from `attendance_late_summary` (+ optional leave/reg/OT) facts only — no invented punches; month overview does not invent missing-row absents.

### RBAC

See `ATTENDANCE_MONTH_RBAC`:

- Open pack: any of `hr.attendance.read` | `hr.attendance.team` | `hr.punch.self`
- `hr.punch.self` → **self-only**; never leak teammate punches
- Data classes: `hr_attendance`, `hr_pii`; sensitivity `hr_sensitive`
- Not a payroll/salary pack

Wire Save report `permissionsUsed` from the chapters that actually ran; download must re-check.

### Finding shapes

See `ATTENDANCE_MONTH_FINDING_SHAPES` — period gap, overview, late/absent material, top late (≤3), leave/reg/OT, quiet.

### Chapters / tools

`attendance_late_summary`, `leave_summary`, `regularisation_summary`, `overtime_summary` (OT deferred if skill/RBAC thin).

### Charts (thin)

- `kpi_strip` ← present / late / absent  
- `ageing_or_attention` ← top late  

---

## Goldens

`ATTENDANCE_MONTH_GOLDENS` — signature, typo phrasing, month late/absent, day stays skill, director Month stays `#1`, bare → clarify.

Wire into CI when implementer lands recipe routing; do not claim green until Save report round-trips an Attendance Month `NovaPackResult` and pack id is added to `NOVA_SAVEABLE_PACK_IDS` + chat Save button titles.

---

## Implementer checklist (post–save-report health-match)

1. Deployer: live `/api/health` includes save-report follow-up; pull this branch.
2. Add recipe `attendance_month` + live runner; route month attendance phrases away from day-default skill.
3. Extend metric dictionary for new draft ids; fill stub metrics from skill facts only.
4. Add `attendance_month` to `NOVA_SAVEABLE_PACK_IDS`, `titleForNovaSaveablePack`, chat Save label.
5. Goldens in CI; keep “late today” on thin skill.
6. No version bump in prep — deployer owns semver when shipping.

---

## Explicit non-goals (this PREP)

- No version bump, no Railway, no push/merge to `main`
- No payroll / salary theatre
- No silent-month default on bare “attendance”
- No ERP writes

---

## Files in this PREP

- `src/lib/nova/packs/attendance-month-prep.ts`
- `src/lib/nova/packs/ATTENDANCE_MONTH_HANDOFF.md` — this document
- `src/lib/nova/pack-result.ts` — `NovaPackId` includes `attendance_month`
- `src/lib/nova/packs/packs.test.ts` — stub + overflow smoke
