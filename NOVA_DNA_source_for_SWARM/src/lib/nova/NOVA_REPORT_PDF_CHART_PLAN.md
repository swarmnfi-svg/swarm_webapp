# NOVA Report PDF + Chart Plan

## Why Delivery Delay Was Chat-Only

NOVA already has a report plane for immutable `NovaPackResult` snapshots:

- Pack answers expose `answer.pack` to the chat UI.
- The UI shows **Save report** for those packs.
- Saved reports download through `/api/nova/reports/[id]?format=pdf|csv|txt|json`.
- The PDF renderer reads pack metrics, attentions, findings, and chart bindings.

`delivery delay reports` routed correctly to `delivery_summary`, and the skill returned good facts from `DeliveryRecord`, but it was only a plain tool fact. It did not set a report intent, did not emit a `NovaPackResult`, and therefore the UI had no artifact contract to save or download.

## Shared Contract

Every supported report-intent answer should return either a report-ready pack or an explicit not-wired message.

Report-ready pack fields:

- `packId`, `packVersion`, `schemaVersion`
- `period`: label, grain, calendar kind, source
- `dataAsOf`
- `metrics`: stable metric ids, values, displays, certification
- `facts`: source tool facts used to build the report
- `findings` and `attentions`: material observations with evidence
- `charts`: frozen chart specs (`bindingId`, metric ids, title, points)
- `links`: ERP source screens
- `warnings` and `omittedNotes`: scope, permission, freshness, or unsupported-column notes
- `narrativeHints`: deterministic report summary hints

Saved report envelope fields:

- title
- generatedBy / owner user id through `NovaReport.ownerUserId`
- sensitivity
- permissionsUsed
- dataAsOf
- checksum
- object keys / download URL derived from report id

Module-specific table rows should be carried in `pack.facts` until a generic `pack.tables[]` schema is introduced.

## P0: Delivery Delay Report

Implemented scope:

- Detect report intent for delay asks (`report`, `reports`, `pdf`, `chart`, `download`, `save`).
- Keep ordinary `delivery delays` as chat-only unless the user asks for a report.
- Build `delivery_delay_report` pack from `DeliveryRecord`.
- Include metrics for incomplete and overdue/stuck delivery counts.
- Include charts:
  - delay days by project
  - status distribution
- Include PDF table rows from real fields:
  - project id/name
  - customer
  - stage
  - delay days
  - stuck days
  - engineer in charge
  - dispatch date
- Preserve `delivery.read` as the report save/download permission witness.

Limitations:

- PDF is generated after the user clicks **Save report** or says a save/download follow-up, matching the existing NOVA report plane.
- Engineer responsibility is only `DeliveryRecord.engineerInCharge`; no inferred responsibility.
- CSV is still generic metrics/charts/attentions, not a module-specific row export.

## Fallback Behavior

For report-intent modules that are not wired to a pack yet, NOVA should say:

> PDF report generation is not wired for this module yet. I can show the current chat/table facts here, and the report pack can be added next.

Do not silently return chat-only when the query clearly asks for a report/PDF/chart.

## Rollout Order

1. Delivery / installation delay reports. **Done**
2. Receivables and overdue invoice reports. **Done** (generic engine + pack)
3. Staff advances. **Done**
4. Expense reimbursements. **Done**
5. Project profit/loss. **Done**
6. KPI / attendance / tasks / sales / purchase / tally — see `NOVA_REPORT_CAPABILITY.md` gaps.
7. Generic `pack.tables[]` schema and CSV row export. **Tables done** (PDF); CSV row export still generic metrics/charts.

See also: [`NOVA_REPORT_CAPABILITY.md`](./NOVA_REPORT_CAPABILITY.md).

## Finance And HR Guards

- Finance report packs must reuse existing finance skills and permission checks.
- Staff expense, advance, salary, attendance, and KPI reports must preserve self/team/all scopes.
- Saved report downloads must re-check the same permission witnesses captured at save time.
- Do not use LLM-generated chart data or inferred money totals.

## Deployment Checklist

1. Run focused NOVA tests for delivery report intent and report-plane PDF rendering.
2. Run typecheck.
3. Bump tip version only after any active NOVA/staff-expense tip is finished.
4. Deploy with `git push origin HEAD` only when GitHub auto-deploy is the selected trigger.
5. Verify Railway success.
6. Poll `/api/health` until the new version matches and there is no Application error.
