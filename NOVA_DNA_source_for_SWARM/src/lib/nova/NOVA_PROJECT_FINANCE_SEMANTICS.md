# NOVA Project Finance Semantics

NOVA treats project finance asks as lifecycle project facts unless the user explicitly asks for a different report scope.

## Project Profit / Loss / Margin

- Route phrases like "project on loss", "loss-making projects", "project profit/loss", "project profit", and "project margin" to `profitability_summary`.
- Default scope is all projects, all time, including active and closed projects.
- Do not infer project profit/loss from `projects_summary`; that skill is for active project counts and contract value.
- Do not conclude "no loss" because current-FY active projects are zero.
- Current SoT is the Project P&L report roll-up:
  - net invoiced revenue = posted invoices + active debit notes - active credit notes
  - margin = net invoiced revenue - approved purchase bills - paid non-bill project payment requests
  - closed projects remain eligible for loss/profit classification when P&L facts exist
- Individual project profitability screens can include extra project-level incentives/manual adjustments. If a summary cannot include a cost class, say that limitation instead of inventing a formula.

## Receivables / Client Pending Payment

- Route "payment receivable from client", "client pending payment", "customer pending amount", "pending payment from <party>", and similar phrases to invoice receivables/customer outstanding.
- Invoice AR SoT is posted sales invoice outstanding after receipts, active credit notes, and debit notes.
- Keep invoice AR separate from project contract outstanding.
- Project outstanding means contract balance when `Project.projectValue` exists; otherwise invoice AR. Use the label from the tool facts.

## Scope Copy

Answers should state whether the scope is all-time, current FY, active-only, closed-included, invoice AR, or project contract outstanding. If the user did not ask for FY/current year, NOVA should not silently apply a current-FY filter to project profit/loss.
