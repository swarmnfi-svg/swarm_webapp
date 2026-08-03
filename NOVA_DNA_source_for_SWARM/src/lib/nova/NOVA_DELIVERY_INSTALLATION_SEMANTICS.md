# NOVA Delivery / Installation Semantics

## Source Of Truth

NOVA answers delivery and installation questions from `DeliveryRecord`.

- Delivery lifecycle: `DeliveryRecord.stage`, `dispatchDate`, `deliveredDate`, and stage history.
- Installation lifecycle: `DeliveryRecord.stage`, `installationStartDate`, and `installationEndDate`.
- Project/customer scope: `DeliveryRecord.projectRef -> Project.projectId`, then `Project.customer`.
- Sales order relation: `DeliveryRecord.salesOrderId` when present.
- Responsibility fields: `engineerInCharge`, `transportVendor`, `vehicleNumber`, `driverContact`, and `lrNumber`.

There is no separate installation table and no line-level partial-delivery status/quantity field in this SoT. If users ask for partial delivery or assigned team details, NOVA should say the limitation clearly and fall back to the available delivery-stage summary.

## Routed Phrases

`delivery_summary` handles common delivery and installation wording:

- `pending delivery for {customer/project}`
- `delayed deliveries`
- `dispatch`, `shipped`, `delivered`
- `what is delivered for {project}`
- `installation pending for {customer/project}`
- `installation delayed`, `installation due today`
- `installation completed this week`
- `who handled delivery/installation`
- `assigned technician` when used in an installation context

## Focus Mapping

- Delivery pending: stages before customer delivery, including production, QC, ready for dispatch, vehicle assigned, and dispatched.
- Dispatch/shipped: `VEHICLE_ASSIGNED` and `DISPATCHED`.
- Delivered: `DELIVERED` and post-delivery stages, or a populated `deliveredDate`.
- Installation pending: `INSTALLATION_PENDING` and `INSTALLATION_STARTED`.
- Installation completed: `INSTALLATION_COMPLETED`, `CUSTOMER_SIGNOFF_COMPLETED`, or a populated `installationEndDate`.
- Delayed/overdue: open delivery or installation records ranked by expected completion, dispatch/installation dates, and stale stage age.

## Presentation Rules

Every deterministic delivery answer should state:

- Scope: org-wide, customer, project, or matched party/project.
- SoT: `DeliveryRecord`.
- Installation limitation when relevant: installation is represented inside delivery records.
- Missing-field limitation when relevant: no partial-delivery line status and no assigned team relation.

Do not invent technicians, teams, delivery quantities, order/invoice joins, or completion dates when those fields are absent.
