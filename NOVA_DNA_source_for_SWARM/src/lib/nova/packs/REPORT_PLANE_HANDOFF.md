# Report plane handoff — Sprint 3 PREP

**Branch:** `nova-3-sprint3-prep` only  
**Do NOT merge or push to `main` until Sprint 0–2 are live.**  
**Never bump `package.json` / version on main from this branch. Never `railway up`.**

## Dependency gate (blocking)

| Depends on | Why |
|------------|-----|
| **Sprint 0** — invariants + `nova_readonly` scaffold | Plane write rules + CI markers |
| **Sprint 1** — conversational goldens / DialogState | Save-from-answer UX assumes stable period/entity |
| **Sprint 2 — Month Performance → `NovaPackResult`** | **Hard dependency.** Report snapshots freeze a `NovaPackResult` (metrics, attentions ≤3, charts, narrative). PDF/CSV/list/download all consume that schema. Do not ship report plane against ad-hoc skill dumps. |

Until Sprint 2 Month pack + `NovaPackResult` are **live on the deploy tip**, keep this branch local only — **no merge to `main`, no push required for merge**.

## What this prep adds (on top of tip scaffolding)

Tip already has `NovaReport` Prisma model, envelope types, save/download/regenerate, txt/csv render, RBAC re-check on download. This branch deepens Sprint 3:

| Artifact | Path | Notes |
|----------|------|-------|
| Object keys | `src/lib/nova/reports/object-keys.ts` | `nova/reports/{tenant}/{owner}/{id}/…` incl. `report.pdf` |
| Immutable snapshot helpers | `src/lib/nova/reports/snapshot.ts` | checksum, `buildImmutableNovaReportSnapshot`, `planRegeneratedNovaReportId`, freeze |
| PDF/CSV/text stubs | `src/lib/nova/reports/render-artifacts.ts` | Text+CSV usable; **PDF is stub** (`stub: true`) until real renderer |
| List + RBAC sketch | `src/lib/nova/reports/list-reports.ts` | Per-item `downloadAllowed` + `missingPermissions` |
| List API | `src/app/api/nova/reports/route.ts` | `GET /api/nova/reports` |
| Download PDF format | `src/app/api/nova/reports/[id]/route.ts` | `?format=pdf` → stub bytes |
| Tests | `src/lib/nova/reports/report-plane.test.ts` | Snapshot immutability, regenerate-new-id, PDF stub, RBAC list gate |

## Security envelope fields (v1)

`tenantId`, `ownerUserId`, `packVersion`, `schemaVersion` / `packSchemaVersion`, `metricVersions`, `sensitivity`, `permissionsUsed`, `dataAsOf`, `expiresAt`, `checksum`, `objectKeys`.

## Immutability rule

- Saved row never mutates pack snapshot / checksum / narrative.
- **Regenerate = new cuid** + `regeneratedFromId` → previous id (see `planRegeneratedNovaReportId` + `regenerateNovaReport`).

## Exit criteria when merging (after S0–S2 live)

1. Save from NOVA AI with Month `NovaPackResult`.
2. List + download re-check current RBAC; revoked perm → 403 / `downloadAllowed: false`.
3. Regenerate creates new id; old row unchanged.
4. Replace PDF stub with real renderer before calling report plane “done.”
5. No ERP operational writes in audit.

## Handoff to main agent

1. Confirm Sprint 0–2 are live (health + CI), especially Month pack returning versioned `NovaPackResult`.
2. Review `nova-3-sprint3-prep` only after that gate; then merge (or cherry-pick report files).
3. Wire “Save report” / “My reports” UI to list + download routes.
4. Retention job + real `nova_bucket` upload still open (object keys are ready).
