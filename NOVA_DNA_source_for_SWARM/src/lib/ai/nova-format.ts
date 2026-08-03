/**
 * Format tool facts into polished user-facing copy (deterministic_polished).
 * Facts stay ERP-truthful — never invents counts/money. Money lines use *Inr fields.
 * Stays English on purpose (money-guard / no-LLM fallback prioritises accuracy over language mirroring).
 */
import type { NovaToolFact } from "@/lib/ai/nova-tools";
import { formatNovaFindings, type NovaFinding } from "@/lib/nova/recipes/finding";
import { formatNovaScopeLabel } from "@/lib/ai/nova-presentation";
import { formatPrepPolishedFact } from "@/lib/nova/presentation";

export type FormatFactsOptions = {
  /** Mechanical legacy template — tests/debug only. Default is polished. */
  style?: "polished" | "raw";
};

/** @deprecated Prefer formatFactsPolished — alias kept for call sites / tests. */
export function formatFactsDeterministic(
  query: string,
  facts: NovaToolFact[],
  opts?: FormatFactsOptions
): string | null {
  return formatFactsPolished(query, facts, opts);
}

/** Polished deterministic presenter (default fallback for hybrid_guarded). */
export function formatFactsPolished(
  query: string,
  facts: NovaToolFact[],
  opts?: FormatFactsOptions
): string | null {
  void opts; // style reserved — polished is the only user-facing path
  const lines: string[] = [];
  const ok = facts.filter((f) => f.ok && f.data && !f.denied);
  if (ok.length === 0) return null;

  for (const f of ok) {
    const d = f.data as Record<string, unknown>;
    if (f.tool === "entity_resolve" && d.message) {
      lines.push(String(d.message));
      continue;
    }
    if (f.tool === "person_resolve" && d.message) {
      lines.push(String(d.message));
      continue;
    }
    if (f.tool === "entity_360") {
      const block = formatEntity360Fact(d);
      if (block) lines.push(block);
      continue;
    }
    // Non-attendance polished modules (sales/receipts/tasks/bank/approvals/queues)
    const prep = formatPrepPolishedFact(f.tool, d);
    if (prep) {
      lines.push(prep);
      continue;
    }
    if (f.tool === "overdue_invoices") {
      const count = Number(d.count ?? 0);
      lines.push(
        count === 0 ? "**Overdue invoices:** none right now." : `**Overdue invoices:** ${count}`
      );
      const samples = d.samples as
        | { number?: string; customer?: string; due?: string | null; amountInr?: string }[]
        | undefined;
      for (const s of (samples ?? []).slice(0, 8)) {
        lines.push(
          `• ${s.customer ?? "—"} — ${s.number ?? "—"}${s.amountInr ? ` — ${s.amountInr}` : ""}${
            s.due ? ` (due ${s.due})` : ""
          }`
        );
      }
    } else if (f.tool === "collection_delay_estimate") {
      if (d.empty || d.predictionAvailable === false) {
        lines.push(
          `**Collection delay estimate:** ${d.note ?? "No prediction — insufficient overdue facts."}`
        );
      } else {
        lines.push(`**Collection delay estimate** _(prediction — not ledger truth)_:`);
        if (typeof d.findingsFormatted === "string" && d.findingsFormatted.trim()) {
          lines.push(d.findingsFormatted.trim());
        } else if (d.estimateLabel) {
          lines.push(`• ${d.estimateLabel}`);
        }
        if (d.note) lines.push(`_${String(d.note)}_`);
      }
    } else if (f.tool === "projects_summary") {
      if (d.mode === "confirmed_in_period") {
        lines.push(`**Projects confirmed** (${d.period}): ${d.confirmedCount ?? d.activeCount ?? 0}`);
        if (d.valueVisible && d.totalProjectValueInr !== "hidden") {
          lines.push(
            `**Value:** ${d.totalProjectValueInr} · **Received:** ${d.totalReceivedInr} · **Outstanding:** ${d.totalOutstandingInr}`
          );
        }
        if (d.scopeNote) lines.push(`_${String(d.scopeNote)}_`);
        const samples = d.samples as
          | {
              id?: string;
              name?: string;
              customer?: string;
              valueInr?: string;
              receivedInr?: string;
              outstandingInr?: string;
              confirmedAt?: string | null;
            }[]
          | undefined;
        if (samples?.length) {
          for (const r of samples.slice(0, 6)) {
            lines.push(
              `• ${r.id ?? ""} ${r.name ?? ""}${r.customer ? ` · ${r.customer}` : ""}` +
                (r.confirmedAt ? ` · confirmed ${r.confirmedAt}` : "") +
                (d.valueVisible && r.valueInr && r.valueInr !== "hidden"
                  ? ` — value ${r.valueInr}, received ${r.receivedInr}, outstanding ${r.outstandingInr}`
                  : "")
            );
          }
        } else if (Number(d.confirmedCount ?? 0) === 0) {
          lines.push("No projects were confirmed in this period.");
        }
      } else {
        if (d.period) lines.push(`**Projects scope:** ${d.period}`);
        lines.push(`**Active projects (in scope):** ${d.activeCountInPeriod ?? d.activeCount}`);
        if (d.valueVisible && d.totalActiveProjectValueInr !== "hidden") {
          lines.push(`**Project value in scope (excl. adjustments):** ${d.totalActiveProjectValueInr}`);
        }
        const biggest = d.biggestProject as { name?: string; valueInr?: string; id?: string } | null;
        if (biggest?.name) {
          lines.push(`**Biggest project (excl. adjustments):** ${biggest.name} (${biggest.id}) — ${biggest.valueInr}`);
        }
      }
    } else if (f.tool === "staff_expense_summary") {
      lines.push(`**Expenses paid** (${d.period}): ${d.totalPaidInr}`);
      if (d.manualPaidInr != null && d.paymentRequestPaidInr != null) {
        lines.push(
          `Manual vouchers: ${d.manualPaidInr} · Expense payment requests: ${d.paymentRequestPaidInr}`
        );
      }
      if (d.emptyNote) lines.push(String(d.emptyNote));
      else if (Number(d.totalPaid ?? 0) === 0) {
        lines.push("No paid expenses were recorded for this period.");
      }
      if (d.reportIntent) {
        lines.push("_Report pack ready: use **Save report** to download the PDF with charts and table._");
      }
    } else if (f.tool === "kpi_summary") {
      if (d.message) lines.push(String(d.message));
      else {
        lines.push(
          `**KPI** (${d.period}, ${d.periodStatus}, scope ${d.scope}): ${d.reviewCount} review(s)` +
            (d.averageScore != null ? `, avg **${d.averageScore}**` : "") +
            (d.highestScore != null ? `, high ${d.highestScore}` : "") +
            (d.lowestScore != null ? `, low ${d.lowestScore}` : "")
        );
        const listMode = d.listMode as string | undefined;
        const top = (d.staffScores ?? d.top) as
          | { name?: string; staffCode?: string | null; score?: number | null; grade?: string | null }[]
          | undefined;
        if (top?.length) {
          const label = listMode === "all_staff" ? "**Staff scores:**" : "**Top:**";
          const limit = listMode === "all_staff" ? top.length : 5;
          lines.push(
            `${label} ` +
              top
                .slice(0, limit)
                .map(
                  (r) =>
                    `${r.name}${r.staffCode ? ` (${r.staffCode})` : ""} ${r.score ?? "—"}${
                      r.grade ? `/${r.grade}` : ""
                    }`
                )
                .join("; ")
          );
        }
        if (d.scopeNote) lines.push(`_${String(d.scopeNote)}_`);
      }
    } else if (f.tool === "kpi_report") {
      if (d.message) lines.push(String(d.message));
      else {
        const subject = d.subject as { name?: string; relation?: string } | undefined;
        const who =
          subject?.relation === "other" && subject.name
            ? subject.name
            : subject?.relation === "self"
              ? "Your"
              : "KPI";
        lines.push(
          `**${who === "Your" ? "Your KPI report card" : `KPI report card — ${who}`}** (${d.period}): ` +
            (d.totalScore != null ? `**${d.totalScore}** / ${d.grade}` : "not scored") +
            (d.verdict ? ` · ${d.verdict}` : "")
        );
        if (d.headline) lines.push(String(d.headline));
        if (d.summary) lines.push(String(d.summary));
        if (d.trendNote) lines.push(`Trend: ${d.trendNote}`);
        const drags = d.drags as { name?: string; score?: number | null }[] | undefined;
        if (drags?.length) {
          lines.push(
            "**Pulling down:** " +
              drags.slice(0, 3).map((r) => `${r.name} (${r.score ?? "—"})`).join("; ")
          );
        }
        const boosts = d.boosts as { name?: string; score?: number | null }[] | undefined;
        if (boosts?.length) {
          lines.push(
            "**Lifting:** " +
              boosts.slice(0, 3).map((r) => `${r.name} (${r.score ?? "—"})`).join("; ")
          );
        }
      }
    } else if (f.tool === "purchase_bills_summary") {
      const count = Number(d.billCount ?? 0);
      lines.push(
        count === 0
          ? `**Purchase bills** (${d.period}): none for this period.`
          : `**Purchase bills** (${d.period}): ${d.totalInvoiceValueInr} (${count} bill(s); ${d.pendingApprovalCount} pending approval).`
      );
    } else if (f.tool === "bank_recon_summary") {
      const nUnrec = Number(d.unreconciledTotal ?? 0);
      lines.push(
        nUnrec === 0
          ? "**Bank reconciliation:** no unreconciled lines."
          : `**Unreconciled bank lines:** ${nUnrec}`
      );
      if (nUnrec > 0 && d.oldestDays != null) lines.push(`Oldest unreconciled: ${d.oldestDays} day(s)`);
      const aging = d.agingBuckets as Record<string, number> | null | undefined;
      if (aging && typeof aging === "object") {
        const parts = Object.entries(aging)
          .filter(([, v]) => typeof v === "number" && v > 0)
          .slice(0, 6)
          .map(([k, v]) => `${k}: ${v}`);
        if (parts.length) lines.push(`**Aging:** ${parts.join(" · ")}`);
      }
      const oldestSamples = d.oldestSamples as
        | { date?: string | null; bank?: string | null; direction?: string; amountInr?: string }[]
        | undefined;
      if (oldestSamples?.length) {
        lines.push("**Oldest unreconciled samples:**");
        for (const s of oldestSamples.slice(0, 5)) {
          lines.push(
            `• ${s.date ?? "—"} · ${s.bank ?? "—"} · ${s.direction ?? "—"} · ${s.amountInr ?? "—"}`
          );
        }
      }
      const upload = d.lastStatementUpload as
        | {
            uploadCount?: number;
            accountsWithUpload?: number;
            totalImported?: number;
            totalDuplicates?: number;
            recent?: { file?: string; bank?: string | null; uploadedAt?: string; imported?: number }[];
          }
        | undefined;
      if (upload) {
        lines.push(
          `**Statement uploads:** ${upload.uploadCount ?? 0} file(s)` +
            (upload.accountsWithUpload != null
              ? ` · ${upload.accountsWithUpload} account(s) with a last upload`
              : "") +
            (upload.totalImported != null ? ` · ${upload.totalImported} imported` : "") +
            (upload.totalDuplicates != null ? ` · ${upload.totalDuplicates} duplicates` : "") +
            "."
        );
        if (upload.recent?.length) {
          for (const u of upload.recent.slice(0, 3)) {
            lines.push(
              `• ${u.uploadedAt ?? "—"} · ${u.bank ?? "—"} · ${u.file ?? "file"}` +
                (u.imported != null ? ` (${u.imported} imported)` : "")
            );
          }
        }
      }
      if (d.balancesVisible === false) {
        lines.push("Account balances are hidden for your role.");
      }
      if (d.note) lines.push(String(d.note));
    } else if (f.tool === "receivables_summary") {
      const count = Number(d.overdueCount ?? 0);
      lines.push(
        count === 0
          ? "**Receivables:** no overdue invoices."
          : `**Receivables:** ${count} overdue invoice(s), outstanding ~ ${d.overdueTotalInr}`
      );
      if (d.openInvoiceCount != null) {
        lines.push(
          `Open invoices: ${d.openInvoiceCount} (~ ${d.openInvoiceTotalInr ?? "—"})`
        );
      }
      const samples = d.samples as
        | { number?: string; customer?: string; due?: string | null; amountInr?: string }[]
        | undefined;
      if (samples?.length) {
        lines.push("**Parties / sample overdue invoices:**");
        for (const s of samples.slice(0, 8)) {
          lines.push(
            `• ${s.customer ?? "—"} — ${s.number ?? "—"}${s.amountInr ? ` — ${s.amountInr}` : ""}${
              s.due ? ` (due ${s.due})` : ""
            }`
          );
        }
        const sampleCount = Number(d.sampleCount ?? samples.length);
        if (count > sampleCount) {
          lines.push(`_(Showing ${sampleCount} of ${count} overdue — totals above are complete.)_`);
        }
      }
      if (d.reportIntent) {
        lines.push("_Report pack ready: use **Save report** to download the PDF with charts and table._");
      }
    } else if (f.tool === "tasks_summary") {
      const subject = d.subject as { name?: string; relation?: string } | undefined;
      const entityLabel =
        d.entityFilter != null && String(d.entityFilter).trim()
          ? String(d.entityFilter).trim().replace(/\s+/g, " ")
          : "";
      const whoLabel =
        subject?.relation === "other" && subject.name
          ? ` for **${subject.name}**`
          : d.customerScoped && entityLabel
            ? ` for customer **${entityLabel}**`
            : d.projectScoped && entityLabel
              ? ` for project **${entityLabel}**`
              : "";
      if (d.message) {
        lines.push(String(d.message));
      }
      const open = Number(d.openCount ?? 0);
      const overdue = Number(d.overdueCount ?? 0);
      if (open === 0 && overdue === 0 && !d.message) {
        lines.push(`**Tasks${whoLabel}:** nothing open or overdue in scope.`);
      } else if (!(open === 0 && overdue === 0 && d.message)) {
        lines.push(`**Tasks${whoLabel}**`);
        lines.push(`- **${open}** open`);
        lines.push(`- **${overdue}** overdue`);
        if (d.dueSoonCount != null) lines.push(`- **${d.dueSoonCount}** due in 7 days`);
        if (d.completedCount != null) {
          lines.push(`- **${d.completedCount}** completed (${d.completedPeriod})`);
        }
      }
      // One scope line only — never customer + project double claim.
      if (d.customerScoped && entityLabel) {
        lines.push(`- Filtered to customer **${entityLabel}** (across their projects).`);
      } else if (d.projectScoped && entityLabel) {
        lines.push(
          `- Scoped to project **${entityLabel}** — counts are project-filtered (not org-wide).`
        );
      }
      const completers = d.completedByAssignee as
        | { name?: string; staffCode?: string | null; completedCount?: number }[]
        | undefined;
      if (completers?.length) {
        lines.push("**Top completers:**");
        for (const c of completers.slice(0, 5)) {
          lines.push(
            `• ${c.name ?? "Unknown"}${c.staffCode ? ` (${c.staffCode})` : ""} — ${c.completedCount}`
          );
        }
      }
      type TaskSample = {
        no?: string;
        title?: string;
        status?: string;
        priority?: string;
        due?: string | null;
        overdue?: boolean;
        assigneeNames?: string[];
        project?: { name?: string; id?: string } | null;
        requester?: { name?: string | null; staffCode?: string | null } | null;
      };
      const samples = (d.samples as TaskSample[] | undefined) ??
        (d.overdueSamples as TaskSample[] | undefined) ??
        [];
      for (const t of samples.slice(0, 5)) {
        const who =
          t.assigneeNames && t.assigneeNames.length > 0
            ? t.assigneeNames.join(", ")
            : "unassigned";
        const proj = t.project?.name ? ` · ${t.project.name}` : "";
        const dueBit = t.due ? ` · due ${t.due}` : "";
        const flag = t.overdue ? " · OVERDUE" : "";
        lines.push(
          `• ${t.no ?? ""} ${t.title ?? ""} — ${who} · ${t.status ?? ""}${
            t.priority ? `/${t.priority}` : ""
          }${dueBit}${flag}${proj}`
        );
      }
    } else if (f.tool === "attendance_late_summary") {
      formatAttendancePolished(lines, d);
    } else if (f.tool === "stock_summary") {
      lines.push(
        `**Stock:** ${d.activeItemCount} active item(s); ${d.movementsInPeriod} movement(s)` +
          (d.period && d.period !== "all time (movements: current filter)" ? ` in ${d.period}` : "") +
          "."
      );
      if (Number(d.lowStockCount ?? 0) > 0) {
        lines.push(`**Below minimum:** ${d.lowStockCount} item(s)`);
        const low = d.lowStockItems as { code?: string; name?: string; current?: number; minimum?: number }[] | undefined;
        for (const i of (low ?? []).slice(0, 4)) {
          lines.push(`• ${i.code} ${i.name} — ${i.current} / min ${i.minimum}`);
        }
      }
    } else if (f.tool === "delivery_summary") {
      const focus = String(d.focus ?? "summary");
      const scope =
        d.entityFilter && d.scopeKind === "customer"
          ? `customer **${d.entityFilter}**`
          : d.entityFilter && d.scopeKind === "project"
            ? `project **${d.entityFilter}**`
            : d.entityFilter
              ? `matched project/customer **${d.entityFilter}**`
              : "all visible projects";
      lines.push(`_Scope: ${scope}. SoT: ${d.sourceOfTruth ?? "DeliveryRecord"}._`);
      if (typeof d.installationSot === "string" && /\binstallation/i.test(query)) {
        lines.push(`_Installation note: ${d.installationSot}_`);
      }
      if (typeof d.partialDeliveryNote === "string") {
        lines.push(`_Limitation: ${d.partialDeliveryNote}_`);
      }
      if (/delay/i.test(focus)) {
        const incomplete = Number(d.incompleteCount ?? d.deliveryCount ?? 0);
        const delayed = Number(d.delayedSampleCount ?? 0);
        const label = /installation/i.test(focus) ? "Installation delays" : "Delivery delays";
        lines.push(
          `**${label}** (${d.period}): ${incomplete} open record(s)` +
            (delayed > 0 ? `; sample shows **${delayed}** overdue / stuck.` : ".")
        );
        const top = d.topDelayed as
          | {
              project?: string;
              projectId?: string;
              stage?: string;
              delayDays?: number;
              dispatch?: string | null;
              installationStart?: string | null;
              dispatchOverdue?: boolean;
              installationOverdue?: boolean;
              projectDelayDays?: number;
              stuckDays?: number;
              engineerInCharge?: string | null;
            }[]
          | undefined;
        if (top?.length) {
          lines.push("**Most delayed:**");
          for (const row of top.slice(0, 6)) {
            const bits: string[] = [];
            if (Number(row.delayDays ?? 0) > 0) bits.push(`${row.delayDays}d`);
            if (row.dispatchOverdue && row.dispatch) bits.push(`dispatch ${row.dispatch}`);
            if (row.installationOverdue && row.installationStart) bits.push(`install ${row.installationStart}`);
            if (Number(row.stuckDays ?? 0) >= 7) bits.push(`stuck ${row.stuckDays}d`);
            if (row.engineerInCharge) bits.push(`engineer ${row.engineerInCharge}`);
            lines.push(
              `• ${row.projectId ?? ""} ${row.project ?? "—"} — ${row.stage ?? "—"}${bits.length ? ` (${bits.join(", ")})` : ""}`
            );
          }
        } else if (incomplete === 0) {
          lines.push("No open delivery/installation records match this filter.");
        } else {
          lines.push("Open records found, but none look overdue yet (check stage ages on Delivery).");
        }
        if (d.reportIntent) {
          lines.push("_Report pack ready: use **Save report** to download the PDF with charts and table._");
        }
      } else if (focus === "responsibility") {
        lines.push(`**Delivery / installation responsibility** (${d.period}): ${d.deliveryCount} record(s).`);
        if (typeof d.responsibilityNote === "string") {
          lines.push(`_Limitation: ${d.responsibilityNote}_`);
        }
        const samples = d.samples as
          | {
              project?: string;
              projectId?: string;
              stageLabel?: string;
              engineerInCharge?: string | null;
              transportVendor?: string | null;
              vehicleNumber?: string | null;
              lrNumber?: string | null;
            }[]
          | undefined;
        for (const row of (samples ?? []).slice(0, 6)) {
          const people = [
            row.engineerInCharge ? `engineer ${row.engineerInCharge}` : null,
            row.transportVendor ? `transport ${row.transportVendor}` : null,
            row.vehicleNumber ? `vehicle ${row.vehicleNumber}` : null,
            row.lrNumber ? `LR ${row.lrNumber}` : null,
          ].filter(Boolean);
          lines.push(
            `• ${row.projectId ?? ""} ${row.project ?? "—"} — ${row.stageLabel ?? "—"}${people.length ? ` (${people.join(", ")})` : " (no responsible person/vendor stored)"}`
          );
        }
      } else {
        const title =
          focus === "delivery_pending"
            ? "Pending delivery"
            : focus === "dispatch"
              ? "Dispatch / shipped"
              : focus === "delivered"
                ? "Delivered"
                : focus === "installation_pending"
                  ? "Installation pending"
                  : focus === "installation_completed"
                    ? "Installation completed"
                    : "Deliveries";
        lines.push(`**${title}** (${d.period}): ${d.deliveryCount} record(s).`);
        if (d.pendingDeliveryCount != null) lines.push(`- Pending delivery stages: **${d.pendingDeliveryCount}**`);
        if (d.deliveredCount != null) lines.push(`- Delivered/post-delivery stages: **${d.deliveredCount}**`);
        if (d.installationPendingCount != null) lines.push(`- Installation pending/started: **${d.installationPendingCount}**`);
        if (d.installationCompletedCount != null) lines.push(`- Installation completed/signoff: **${d.installationCompletedCount}**`);
        const byStage = d.byStage as { stage?: string; count?: number }[] | undefined;
        if (byStage?.length) {
          lines.push(
            "By stage: " + byStage.map((s) => `${s.stage} (${s.count})`).join(", ")
          );
        }
        const samples = d.samples as
          | {
              project?: string;
              projectId?: string;
              customer?: string | null;
              stageLabel?: string;
              dispatch?: string | null;
              delivered?: string | null;
              installationStart?: string | null;
              installationEnd?: string | null;
              engineerInCharge?: string | null;
            }[]
          | undefined;
        for (const row of (samples ?? []).slice(0, 5)) {
          const dates = [
            row.dispatch ? `dispatch ${row.dispatch}` : null,
            row.delivered ? `delivered ${row.delivered}` : null,
            row.installationStart ? `install start ${row.installationStart}` : null,
            row.installationEnd ? `install end ${row.installationEnd}` : null,
            row.engineerInCharge ? `engineer ${row.engineerInCharge}` : null,
          ].filter(Boolean);
          lines.push(
            `• ${row.projectId ?? ""} ${row.project ?? "—"}${row.customer ? ` (${row.customer})` : ""} — ${row.stageLabel ?? "—"}${dates.length ? `; ${dates.join(", ")}` : ""}`
          );
        }
        const showing = Number(d.samplesShowing ?? d.sampleCount ?? 0);
        const of = Number(d.samplesOf ?? d.deliveryCount ?? 0);
        if (showing > 0 && of > showing) {
          lines.push(`_(Showing ${showing} of ${of} deliveries.)_`);
        }
      }
    } else if (f.tool === "vendors_summary") {
      lines.push(`**Vendors:** ${d.activeCount} active / ${d.totalCount} total.`);
    } else if (f.tool === "payment_requests_summary") {
      if (d.message) lines.push(String(d.message));
      else {
        const who =
          d.subject && typeof (d.subject as { name?: string }).name === "string"
            ? (d.subject as { name: string }).name
            : null;
        lines.push(who ? `**Payment requests — ${who}**` : "**Payment requests**");
        lines.push(
          who
            ? `- **${d.awaitingActionCount}** pending for ${who}`
            : `- **${d.awaitingActionCount}** awaiting action`
        );
        if (d.paidInPeriod != null) lines.push(`- **${d.paidInPeriod}** paid in period`);
        const samples = d.samples as
          | {
              id?: string;
              status?: string;
              amountInr?: string;
              purpose?: string | null;
              party?: string;
            }[]
          | undefined;
        if (samples?.length) {
          for (const s of samples.slice(0, 12)) {
            const label = (s.purpose ?? s.party ?? "—").toString().trim() || "—";
            lines.push(`- ${s.id ?? "—"} · ${label} · ${s.amountInr ?? "—"} · ${s.status ?? "—"}`);
          }
        }
      }
    } else if (f.tool === "customers_summary") {
      lines.push(`**Customers:** ${d.activeCount} active / ${d.totalCount} total.`);
    } else if (f.tool === "staff_summary") {
      if (d.mode === "profile" && d.staff) {
        const s = d.staff as {
          code?: string | null;
          name?: string;
          department?: string | null;
          designation?: string | null;
          status?: string | null;
        };
        lines.push(
          `**${s.name ?? "Staff"}**` +
            (s.code ? ` (${s.code})` : "") +
            (s.designation ? ` — ${s.designation}` : "") +
            (s.department ? `; ${s.department}` : "") +
            (s.status ? `; status: ${s.status}` : "")
        );
      } else if (d.mode === "ambiguous") {
        lines.push(String(d.message ?? "Multiple staff matches — clarify the name or code."));
        const cands = d.candidates as
          | { code?: string | null; name?: string; department?: string | null }[]
          | undefined;
        if (cands?.length) {
          lines.push(
            cands
              .slice(0, 5)
              .map(
                (c) =>
                  `• ${c.name ?? "?"}` +
                  (c.code ? ` (${c.code})` : "") +
                  (c.department ? ` — ${c.department}` : "")
              )
              .join("\n")
          );
        }
      } else if (d.mode === "not_found") {
        lines.push(String(d.message ?? "No matching staff member found."));
      } else {
        lines.push(`**Staff:** ${d.activeCount} active / ${d.totalCount} total.`);
        const depts = d.byDepartment as { department?: string; count?: number }[] | undefined;
        if (depts?.length) {
          lines.push(
            "Top departments: " +
              depts
                .slice(0, 5)
                .map((x) => `${x.department} (${x.count})`)
                .join(", ")
          );
        }
      }
    } else if (f.tool === "leave_summary") {
      if (d.message) lines.push(String(d.message));
      else {
        const scopeBit = formatNovaScopeLabel(d.scope) || String(d.scope ?? "");
        lines.push(`**Leave** (${scopeBit}${d.period ? `, ${d.period}` : ""})`);
        lines.push(`- **${d.pendingCount}** pending`);
        if (d.approvedDaysUsed != null) {
          lines.push(`- **${d.approvedDaysUsed}** approved day(s) used`);
        }
        const bal = d.balancesByType as { type?: string; approvedDaysUsed?: number }[] | undefined;
        if (bal?.length) {
          lines.push(
            "**By type (usage):** " +
              bal
                .slice(0, 6)
                .map((b) => `${b.type} ${b.approvedDaysUsed}d`)
                .join("; ")
          );
        }
        if (d.balanceNote) lines.push(`_${String(d.balanceNote)}_`);
        const monthSnap = d.monthSnapshot as
          | {
              year?: number;
              month?: number;
              leaveRequestsInMonth?: number;
              approvedInMonth?: number;
              pendingInMonth?: number;
              attendanceSummary?: {
                presentDays?: number;
                absentDays?: number;
                paidLeaveDays?: number;
                unpaidLeaveDays?: number;
                lateCount?: number;
              };
            }
          | null
          | undefined;
        if (monthSnap?.attendanceSummary) {
          const a = monthSnap.attendanceSummary;
          lines.push(
            `**This month attendance** (${monthSnap.year}-${String(monthSnap.month).padStart(2, "0")}): ` +
              `${a.presentDays ?? 0} present, ${a.absentDays ?? 0} absent, ` +
              `${a.paidLeaveDays ?? 0} paid leave, ${a.unpaidLeaveDays ?? 0} unpaid leave, ` +
              `${a.lateCount ?? 0} late.`
          );
        }
        const upcoming = d.upcomingApproved as
          | { staff?: string; type?: string; from?: string; to?: string; days?: number }[]
          | undefined;
        if (upcoming?.length) {
          lines.push("**Upcoming approved:**");
          for (const u of upcoming.slice(0, 4)) {
            lines.push(`• ${u.staff} — ${u.type} ${u.from} → ${u.to} (${u.days}d)`);
          }
        }
        const samples = d.samples as { staff?: string; type?: string; from?: string; to?: string }[] | undefined;
        for (const s of (samples ?? []).slice(0, 4)) {
          lines.push(`• ${s.staff} — ${s.type} ${s.from} → ${s.to}`);
        }
      }
    } else if (f.tool === "overtime_summary") {
      if (d.message) lines.push(String(d.message));
      else {
        lines.push(
          `**Overtime** (${d.scope}, focus ${d.focus}): ${d.pendingCount} pending` +
            (d.approvedCount != null ? `; ${d.approvedCount} approved` : "") +
            (d.rejectedCount != null ? `; ${d.rejectedCount} rejected` : "") +
            "."
        );
        if (d.note) lines.push(`_${String(d.note)}_`);
        const samples = d.samples as
          | {
              name?: string;
              code?: string | null;
              date?: string;
              overtimeMinutes?: number;
              status?: string;
            }[]
          | undefined;
        for (const s of (samples ?? []).slice(0, 5)) {
          lines.push(
            `• ${s.name}${s.code ? ` (${s.code})` : ""} — ${s.date} · ${s.overtimeMinutes ?? 0} min · ${s.status}`
          );
        }
      }
    } else if (f.tool === "regularisation_summary") {
      if (d.message) lines.push(String(d.message));
      else {
        lines.push(
          `**Regularisation** (${d.scope}, focus ${d.focus}): ${d.pendingCount} pending` +
            (d.approvedCount != null ? `; ${d.approvedCount} approved` : "") +
            (d.rejectedCount != null ? `; ${d.rejectedCount} rejected` : "") +
            "."
        );
        const samples = d.samples as
          | {
              name?: string;
              code?: string | null;
              date?: string;
              requestType?: string;
              status?: string;
            }[]
          | undefined;
        for (const s of (samples ?? []).slice(0, 5)) {
          lines.push(
            `• ${s.name}${s.code ? ` (${s.code})` : ""} — ${s.date} · ${s.requestType} · ${s.status}`
          );
        }
      }
    } else if (f.tool === "staff_advances_summary") {
      if (d.message) lines.push(String(d.message));
      else {
        lines.push(
          `**Staff advances** (${d.scope}): ${d.openCount} open; balance pending ${d.totalBalancePendingInr}.`
        );
      }
      if (d.reportIntent) {
        lines.push("_Report pack ready: use **Save report** to download the PDF with charts and table._");
      }
    } else if (f.tool === "sales_orders_summary") {
      const valueBit =
        d.ordersInPeriod != null
          ? d.balancesVisible === false || d.periodValueInr === "hidden"
            ? `; ${d.ordersInPeriod} in ${d.period} (values hidden)`
            : `; ${d.ordersInPeriod} in ${d.period} (${d.periodValueInr})`
          : "";
      lines.push(`**Sales orders:** ${d.openOrderCount} open${valueBit}.`);
    } else if (f.tool === "purchase_orders_summary") {
      const valueBit =
        d.balancesVisible === false || d.periodValueInr === "hidden"
          ? " (values hidden)"
          : d.periodValueInr
            ? ` · period ${d.periodValueInr}`
            : "";
      lines.push(
        `**Purchase orders:** ${d.openCount ?? d.openOrRecentCount} open/in progress${valueBit}.`
      );
    } else if (f.tool === "purchase_requests_summary") {
      lines.push(`**Purchase requests pending:** ${d.pendingCount}`);
    } else if (f.tool === "approvals_summary") {
      lines.push("**Open approvals**");
      lines.push(`- **${d.openCount}** open`);
      const samples = d.samples as { no?: string; title?: string; status?: string; approver?: string | null }[] | undefined;
      for (const a of (samples ?? []).slice(0, 4)) {
        lines.push(`- ${a.no} ${a.title} — ${a.status}${a.approver ? ` → ${a.approver}` : ""}`);
      }
    } else if (f.tool === "bank_accounts_summary") {
      if (d.balancesVisible && d.totalOperationalBalanceInr) {
        lines.push(`**Total bank balance (operational):** ${d.totalOperationalBalanceInr}`);
        if (d.totalBookBalanceInr) lines.push(`Book total: ${d.totalBookBalanceInr} · Statement total: ${d.totalStatementBalanceInr}`);
      }
      lines.push(`**Bank accounts:** ${d.accountCount} active.`);
      if (d.balancesVisible) {
        const accts = d.accounts as { bank?: string; nickname?: string | null; bookBalanceInr?: string; id?: string }[] | undefined;
        for (const a of (accts ?? []).slice(0, 5)) {
          lines.push(`• ${a.id ? `${a.id} ` : ""}${a.nickname || a.bank} — book ${a.bookBalanceInr}`);
        }
      } else if (d.note) {
        lines.push(String(d.note));
      }
    } else if (f.tool === "incentives_summary") {
      lines.push(
        `**Incentives** (${d.scope}): ${d.openOrUnpaidCount ?? d.recentOrOpenCount} open/unpaid.`
      );
    } else if (f.tool === "cbg_quotations_summary") {
      lines.push(`**CBG quotations** (${d.period}): ${d.quotationCount}`);
      const byStatus = d.byStatus as { status?: string; count?: number }[] | undefined;
      if (byStatus?.length) {
        lines.push(
          "**Status funnel:** " +
            byStatus.map((s) => `${s.status ?? "?"} ×${s.count ?? 0}`).join("; ")
        );
      }
    } else if (f.tool === "collection_attention" || f.tool === "cbg_pipeline" || f.tool === "project_health" || f.tool === "month_performance" || f.tool === "project_command" || f.tool === "attendance_month" || f.tool === "cash_banking") {
      if (typeof d.narrative === "string" && d.narrative.trim()) {
        lines.push(d.narrative.trim());
      } else {
        const findings = (d.findings ?? []) as NovaFinding[];
        if (findings.length) {
          lines.push(formatNovaFindings(findings));
        } else {
          lines.push(
            `**${f.tool.replace(/_/g, " ")}**${d.entityFilter ? ` (${d.entityFilter})` : ""}: no fact sections available.`
          );
        }
        const notes = d.omittedNotes as string[] | undefined;
        if (notes?.length) lines.push("_Notes:_ " + notes.join(" "));
      }
    } else if (f.tool === "daily_brief") {
      lines.push(
        `**Daily brief** (${d.rolePack ?? d.role ?? "role"} · ${d.period ?? "today"}): ${d.usableSectionCount ?? 0}/${d.sectionCount ?? 0} sections.`
      );
      const sections = d.sections as Record<string, unknown>[] | undefined;
      for (const s of sections ?? []) {
        if (s.denied) {
          lines.push(`• ${s.tool}: denied`);
          continue;
        }
        if (s.ok === false) {
          lines.push(`• ${s.tool}: unavailable`);
          continue;
        }
        const bits: string[] = [];
        if (s.fySalesInr != null) bits.push(`FY sales ${s.fySalesInr}`);
        if (s.fyCollectionInr != null) bits.push(`FY collections ${s.fyCollectionInr}`);
        if (s.grandTotalInr != null) bits.push(`sales ${s.grandTotalInr}`);
        if (s.totalCollectedInr != null) bits.push(`collections ${s.totalCollectedInr}`);
        if (s.salesTotalInr != null) bits.push(`report sales ${s.salesTotalInr}`);
        if (s.collectionsInr != null) bits.push(`report collections ${s.collectionsInr}`);
        if (s.awaitingCount != null) bits.push(`${s.awaitingCount} PR awaiting`);
        if (s.pendingPaymentCount != null) bits.push(`${s.pendingPaymentCount} payments pending`);
        if (s.openTotalInr != null || s.overdueTotalInr != null) {
          bits.push(
            `AR ${s.openTotalInr ?? "—"}${s.overdueTotalInr != null ? ` / overdue ${s.overdueTotalInr}` : ""}`
          );
        }
        if (s.receivablesTotalInr != null) bits.push(`AR ${s.receivablesTotalInr}`);
        if (s.receivablesOutstandingInr != null) bits.push(`AR out ${s.receivablesOutstandingInr}`);
        if (s.payablesTotalInr != null) bits.push(`AP ${s.payablesTotalInr}`);
        if (s.payablesOutstandingInr != null) bits.push(`AP out ${s.payablesOutstandingInr}`);
        if (s.orderBookValueInr != null) {
          bits.push(
            `order book ${s.orderBookValueInr}${
              s.targetAchievementPct != null ? ` (${s.targetAchievementPct}%)` : ""
            }`
          );
        }
        if (s.openOrderCount != null) bits.push(`${s.openOrderCount} open SO`);
        if (s.openPoCount != null) bits.push(`${s.openPoCount} open PO`);
        if (s.periodValueInr != null && (s.openOrderCount != null || s.openPoCount != null)) {
          bits.push(`period ${s.periodValueInr}`);
        }
        if (s.activeProjectCount != null) bits.push(`${s.activeProjectCount} active projects`);
        if (s.totalActiveProjectValueInr != null) {
          bits.push(`project value ${s.totalActiveProjectValueInr}`);
        }
        if (s.journalVoucherCount != null) bits.push(`${s.journalVoucherCount} journals`);
        if (s.netFundsAvailableInr != null) bits.push(`funds ${s.netFundsAvailableInr}`);
        if (s.projectPlTotal != null) bits.push(`${s.projectPlTotal} project P&L rows`);
        if (s.gstr1TotalGstInr != null) bits.push(`GSTR-1 GST ${s.gstr1TotalGstInr}`);
        if (s.gstr3bNetPayableInr != null) bits.push(`GSTR-3B net ${s.gstr3bNetPayableInr}`);
        if (s.eInvoiceTotal != null || s.eWayTotal != null) {
          bits.push(`e-inv ${s.eInvoiceTotal ?? 0} / e-way ${s.eWayTotal ?? 0}`);
        }
        if (s.activeConnectionCount != null || s.connectionCount != null) {
          bits.push(
            `Tally ${s.activeConnectionCount ?? 0}/${s.connectionCount ?? 0} active`
          );
        }
        if (s.unreconciledBankTxns != null) bits.push(`${s.unreconciledBankTxns} unreconciled bank`);
        if (s.unreconciledCount != null) bits.push(`${s.unreconciledCount} unreconciled`);
        if (s.peopleWithLate != null) bits.push(`${s.peopleWithLate} late`);
        if (s.presentPunchDays != null) bits.push(`${s.presentPunchDays} present`);
        if (s.absentDays != null) bits.push(`${s.absentDays} absent`);
        if (s.openTaskCount != null) bits.push(`${s.openTaskCount} open tasks`);
        if (s.overdueTaskCount != null) bits.push(`${s.overdueTaskCount} overdue tasks`);
        // Legacy slim keys (pre-2.117)
        if (s.openCount != null && s.openTaskCount == null) bits.push(`${s.openCount} open tasks`);
        if (s.overdueCount != null && s.overdueTaskCount == null) {
          bits.push(`${s.overdueCount} overdue tasks`);
        }
        if (s.myOpenTasks != null) bits.push(`${s.myOpenTasks} my open tasks`);
        if (s.myScore != null) bits.push(`KPI ${s.myScore}`);
        if (s.averageScore != null && s.myScore == null) bits.push(`KPI avg ${s.averageScore}`);
        if (s.reviewCount != null) bits.push(`${s.reviewCount} KPI reviews`);
        if (s.openOrUnpaidCount != null) bits.push(`${s.openOrUnpaidCount} incentives open`);
        if (s.unreadCount != null) bits.push(`${s.unreadCount} unread`);
        if (s.totalPaidInr != null) bits.push(`expenses ${s.totalPaidInr}`);
        if (s.pendingCount != null) bits.push(`${s.pendingCount} leave pending`);
        if (s.delayedCount != null) bits.push(`${s.delayedCount} delivery delays`);
        if (s.lowStockCount != null) bits.push(`${s.lowStockCount} low stock`);
        if (s.lowStockAlertCount != null) bits.push(`${s.lowStockAlertCount} low-stock alerts`);
        lines.push(`• ${s.tool}: ${bits.length ? bits.join(" · ") : "ok"}`);
      }
      if (d.note) lines.push(`_${String(d.note)}_`);
    } else if (f.tool === "proactive_insights") {
      if (d.empty || Number(d.insightCount ?? 0) === 0) {
        lines.push(`**Proactive insights:** ${d.note ?? "Nothing matched your permissions right now."}`);
      } else {
        lines.push(`**Proactive insights:** ${d.insightCount} card(s).`);
        if (typeof d.findingsFormatted === "string" && d.findingsFormatted.trim()) {
          lines.push(d.findingsFormatted.trim());
        } else {
          const insights = d.insights as
            | { title?: string; observation?: string; confidence?: string }[]
            | undefined;
          for (const i of (insights ?? []).slice(0, 8)) {
            lines.push(
              `• ${i.title ?? "Insight"}: ${i.observation ?? ""}${
                i.confidence ? ` _(${i.confidence})_` : ""
              }`
            );
          }
        }
        if (d.note) lines.push(`_${String(d.note)}_`);
      }
    } else if (f.tool === "nova_analysis") {
      if (d.empty) {
        lines.push(`**Analysis:** ${d.message ?? "Nothing to analyse for your permissions."}`);
      } else {
        const primary =
          (typeof d.primaryNarrative === "string" && d.primaryNarrative.trim()) ||
          (typeof d.llmNarrative === "string" && d.narrativeSource === "llm"
            ? d.llmNarrative
            : null) ||
          (typeof d.deterministicNarrative === "string" ? d.deterministicNarrative : null);
        if (primary) {
          lines.push(String(primary).trim());
        } else {
          lines.push(`**Analysis:** ${d.headline ?? "—"}`);
          if (typeof d.findingsFormatted === "string" && d.findingsFormatted.trim()) {
            lines.push(d.findingsFormatted.trim());
          }
        }
        // Never re-dump deterministic / findings when primary already filled (dedupe).
        if ((d.narrativeSource === "llm_rate_limited" || d.rateLimited) && !primary) {
          lines.push("_LLM narration skipped (rate limited)._");
        }
        if (
          d.note &&
          d.narrativeSource !== "llm_rate_limited" &&
          d.narrativeSource !== "llm_rejected"
        ) {
          lines.push(`_${String(d.note)}_`);
        }
      }
    } else if (f.tool === "nova_trend") {
      if (d.empty || d.planned) {
        lines.push(
          typeof d.primaryNarrative === "string" && d.primaryNarrative.trim()
            ? String(d.primaryNarrative).trim()
            : `**Trend:** ${d.message ?? "Nothing to chart for your permissions."}`
        );
      } else if (typeof d.primaryNarrative === "string" && d.primaryNarrative.trim()) {
        lines.push(String(d.primaryNarrative).trim());
      } else {
        lines.push(`**Trend:** ${d.summary ?? d.message ?? "—"}`);
        if (typeof d.findingsFormatted === "string" && d.findingsFormatted.trim()) {
          lines.push(d.findingsFormatted.trim());
        }
      }
    } else if (f.tool === "my_work_summary") {
      lines.push(`**Your work** (${d.name}${d.staffCode ? ` · ${d.staffCode}` : ""}):`);
      if (d.myOpenTasks != null) {
        lines.push(
          `• Tasks: ${d.myOpenTasks} open` +
            (d.myOverdueTasks ? `, ${d.myOverdueTasks} overdue` : "") +
            (d.myCompletedTasks != null ? `, ${d.myCompletedTasks} completed (${d.completedPeriod})` : "")
        );
      }
      if (d.myKpiScore != null) {
        lines.push(`• KPI (${d.kpiPeriod}): ${d.myKpiScore}${d.myKpiGrade ? ` / ${d.myKpiGrade}` : ""}`);
      }
      if (d.myPendingLeave != null) lines.push(`• Pending leave: ${d.myPendingLeave}`);
    } else if (f.tool === "salary_summary") {
      lines.push(
        `**Salary / payroll** (${d.period}): ${d.paymentsInPeriod} payment(s), paid ${d.paidTotalInr} (${d.payrollRunCount} payroll run(s) on file).`
      );
    } else if (f.tool === "accounts_snapshot") {
      lines.push(
        `**Accounts:** ${d.journalVoucherCount} journal voucher(s)` +
          (d.postedJournalCount != null || d.draftJournalCount != null
            ? ` (${d.postedJournalCount ?? 0} posted, ${d.draftJournalCount ?? 0} draft)`
            : "") +
          `, ${d.activeLedgerAccountCount ?? d.ledgerAccountCount} active ledger account(s)` +
          (d.ledgerAccountCount != null && d.activeLedgerAccountCount != null
            ? ` of ${d.ledgerAccountCount}`
            : "") +
          "."
      );
      if (d.balancesVisible && d.fundPosition) {
        const fp = d.fundPosition as Record<string, string>;
        lines.push(
          `**Fund position — net available:** ${fp.netFundsAvailableInr} (cash ${fp.cashInHandInr}, bank ${fp.positiveBankInr}).`
        );
      }
      if (d.note) lines.push(`_${String(d.note)}_`);
      const related = d.related as { title?: string; href?: string }[] | undefined;
      for (const r of (related ?? []).slice(0, 6)) {
        if (r.title && r.href) lines.push(`• ${r.title} — ${r.href}`);
      }
    } else if (f.tool === "tally_status") {
      lines.push(
        `**Tally:** ${d.activeConnectionCount ?? d.connectionCount} active connection(s)` +
          (d.connectionCount != null &&
          d.activeConnectionCount != null &&
          d.connectionCount !== d.activeConnectionCount
            ? ` (${d.connectionCount} total)`
            : "") +
          "."
      );
      const conns = d.connections as
        | { name?: string; active?: boolean; lastSyncStatus?: string | null; lastSyncAt?: string | null }[]
        | undefined;
      for (const c of (conns ?? []).slice(0, 3)) {
        lines.push(
          `• ${c.name ?? "Connection"}${c.active === false ? " (inactive)" : ""}` +
            (c.lastSyncStatus ? ` — last sync ${c.lastSyncStatus}` : "") +
            (c.lastSyncAt ? ` @ ${c.lastSyncAt}` : "")
        );
      }
      const jobs = d.recentSyncJobs as { status?: string; direction?: string }[] | undefined;
      if (jobs?.length) {
        lines.push(
          `Recent jobs: ${jobs
            .slice(0, 3)
            .map((j) => `${j.status ?? "?"}${j.direction ? `/${j.direction}` : ""}`)
            .join(", ")}.`
        );
      }
      if (d.note) lines.push(`_${String(d.note)}_`);
    } else if (f.tool === "grn_summary") {
      lines.push(`**GRN / material receipts** (${d.period}): ${d.grnCount} receipt(s).`);
    } else if (f.tool === "credit_notes_summary") {
      lines.push(
        `**Credit notes** (${d.period}): ${d.creditNoteCount} · ${d.creditNoteTotalInr}` +
          (d.debitNoteCount ? `; debit notes: ${d.debitNoteCount} · ${d.debitNoteTotalInr}` : "")
      );
    } else if (f.tool === "order_book_summary") {
      const pct =
        d.targetAchievementPct != null ? ` (${d.targetAchievementPct}% of target)` : "";
      lines.push(
        `**Order book / FY target** (${d.period}): target ${d.fyTargetInr ?? "—"}, ` +
          `pipeline ${d.orderBookValueInr ?? "—"}${pct}, completed ${d.completedValueInr ?? "—"}, ` +
          `pending orders ${d.pendingOrderTotalInr ?? "—"}.`
      );
    } else if (f.tool === "director_dashboard_summary") {
      const ob = (d.orderBook as Record<string, unknown> | undefined) ?? {};
      lines.push(
        `**Director dashboard** (${d.period}): bank ${d.bankBalanceInr}, ` +
          `FY sales ${d.fySalesInr}, collections ${d.fyCollectionInr}, ` +
          `AR ${d.receivablesTotalInr}, AP ${d.payablesTotalInr}.`
      );
      lines.push(
        `• Order book target ${ob.targetInr ?? "—"} · pipeline ${ob.orderBookValueInr ?? "—"}` +
          (ob.achievementPct != null ? ` (${ob.achievementPct}%)` : "")
      );
    } else if (f.tool === "reports_snapshot") {
      lines.push(`**Reports** (${d.fy ?? d.period}):`);
      const rs = d.reportSummary as Record<string, string> | null | undefined;
      if (rs) {
        lines.push(`• Sales ${rs.salesTotalInr} · Collections ${rs.collectionsInr} · Purchases ${rs.purchasesInr}`);
        lines.push(`• AR ${rs.receivablesInr} · AP ${rs.payablesInr}`);
      }
      if (d.receivablesOutstandingInr) {
        lines.push(`• Outstanding AR ${d.receivablesOutstandingInr} · AP ${d.payablesOutstandingInr}`);
      }
      if (d.receivablesAging) {
        const a = d.receivablesAging as Record<string, string>;
        lines.push(
          `• AR aging: 0–30 ${a.b0Inr}, 31–60 ${a.b30Inr}, 61–90 ${a.b60Inr}, 90+ ${a.b90Inr} (total ${a.agingTotalInr ?? a.totalInr})`
        );
      }
      if (d.note) lines.push(`_${String(d.note)}_`);
    } else if (f.tool === "gstr_snapshot") {
      lines.push(`**GSTR** (${d.periodKey}):`);
      const g1 = d.gstr1 as {
        b2bCount?: number;
        b2csCount?: number;
        cdnrCount?: number;
        taxableInr?: string;
        totalGstInr?: string;
      } | null;
      if (g1) {
        lines.push(
          `• GSTR-1: B2B ${g1.b2bCount ?? 0}, B2CS ${g1.b2csCount ?? 0}, CDNR ${g1.cdnrCount ?? 0}` +
            (g1.taxableInr ? ` · taxable ${g1.taxableInr}` : "") +
            (g1.totalGstInr ? ` · GST ${g1.totalGstInr}` : "")
        );
      }
      const g3 = d.gstr3b as { outputTaxInr?: string; netPayableInr?: string } | null;
      if (g3) {
        lines.push(
          `• GSTR-3B: output ${g3.outputTaxInr ?? "—"}, net payable ${g3.netPayableInr ?? "—"}`
        );
      }
      if (d.moneyNote) lines.push(`_${String(d.moneyNote)}_`);
      if (d.note) lines.push(`_${String(d.note)}_`);
    } else if (f.tool === "gst_docs_summary") {
      lines.push(
        `**E-invoice / e-way:** ${d.eInvoiceTotal ?? 0} e-invoice record(s), ${d.eWayTotal ?? 0} e-way record(s).`
      );
    } else if (f.tool === "profitability_summary") {
      if (d.fundPosition) {
        const fp = d.fundPosition as Record<string, string>;
        lines.push(`**Fund position — net available:** ${fp.netFundsAvailableInr}`);
      }
      const scope = String(d.projectPlScope ?? "all projects, all time");
      const sot = typeof d.projectPlSot === "string" ? d.projectPlSot : null;
      const lossCount = d.lossMakingProjectCount;
      lines.push(`**Project P&L scope:** ${scope} (${d.projectPlTotal ?? 0} project(s); active + closed included).`);
      if (typeof lossCount === "number") {
        lines.push(`**Loss-making projects:** ${lossCount}`);
      }
      if (sot) lines.push(`_SoT: ${sot}_`);
      const rows =
        (d.focusedProjectPlRows as
          | { project?: string; projectId?: string; status?: string; marginInr?: string; outstandingInr?: string; invoicedInr?: string; purchasesInr?: string }[]
          | undefined) ??
        (d.projectPlSample as
          | { project?: string; projectId?: string; status?: string; marginInr?: string; outstandingInr?: string; invoicedInr?: string; purchasesInr?: string }[]
          | undefined);
      if (rows?.length) {
        lines.push(
          d.projectPlFocus === "loss_making_projects"
            ? "**Loss-making project sample:**"
            : "**Project P&L sample:**"
        );
      } else if (d.projectPlFocus === "loss_making_projects" && lossCount === 0) {
        lines.push("No loss-making project is visible in the current Project P&L SoT.");
      }
      for (const r of (rows ?? []).slice(0, 8)) {
        lines.push(
          `• ${r.project ?? "—"}${r.projectId ? ` (${r.projectId})` : ""}` +
            `${r.status ? ` · ${r.status}` : ""}` +
            ` — margin ${r.marginInr ?? "—"}, outstanding ${r.outstandingInr ?? "—"}` +
            (r.invoicedInr || r.purchasesInr
              ? ` (invoiced ${r.invoicedInr ?? "—"}, costs ${r.purchasesInr ?? "—"})`
              : "")
        );
      }
      if (d.projectPlGapNote) lines.push(`_${String(d.projectPlGapNote)}_`);
      if (d.reportIntent) {
        lines.push("_Report pack ready: use **Save report** to download the PDF with charts and table._");
      }
    } else if (f.tool === "customer_outstanding") {
      lines.push(
        `**Customer receivables / pending from client**${d.customerFilter ? ` (${d.customerFilter})` : ""}: ${d.outstandingTotalInr} across ${d.rowCount} open invoice(s).`
      );
      if (d.moneyNote) lines.push(`_SoT: invoice AR from posted sales invoices minus receipts/active credit notes plus debit notes; this is not project contract outstanding._`);
      const top = d.top as { customer?: string; invoice?: string; outstandingInr?: string; days?: number }[] | undefined;
      for (const r of (top ?? []).slice(0, 5)) {
        lines.push(`• ${r.customer} · ${r.invoice} — ${r.outstandingInr}${r.days != null ? ` (${r.days}d)` : ""}`);
      }
    } else if (f.tool === "search_entities") {
      const n = Number(d.matchCount ?? 0);
      const hint =
        typeof d.searchHint === "string" && d.searchHint.trim()
          ? ` matching “${d.searchHint.trim()}”`
          : "";
      if (n > 0) {
        lines.push(`**Search:** ${n} matching record(s)${hint}.`);
        const matches = d.matches as
          | { kind?: string; title?: string; subtitle?: string | null; href?: string }[]
          | undefined;
        for (const m of (matches ?? []).slice(0, 8)) {
          if (!m?.title) continue;
          const kind = m.kind ? `[${m.kind}] ` : "";
          const sub = m.subtitle ? ` — ${m.subtitle}` : "";
          if (m.href) lines.push(`• ${kind}[${m.title}](${m.href})${sub}`);
          else lines.push(`• ${kind}${m.title}${sub}`);
        }
      }
    } else if (f.tool === "documents_open") {
      if (d.empty || Number(d.totalCount ?? 0) === 0) {
        lines.push(`**${d.screen ?? "Documents"}:** ${d.note ?? "No documents on file yet."}`);
      } else {
        lines.push(`**${d.screen ?? "Documents"}:** ${d.totalCount} active file(s).`);
        if (d.recent7dCount != null && Number(d.recent7dCount) > 0) {
          lines.push(`• Uploaded last 7 days: ${d.recent7dCount}`);
        }
        if (d.archivedCount != null && Number(d.archivedCount) > 0) {
          lines.push(`• Archived: ${d.archivedCount}`);
        }
        const byModule = d.byModule as { module?: string; count?: number }[] | undefined;
        for (const m of (byModule ?? []).slice(0, 8)) {
          if (m.module != null && m.count != null) lines.push(`• ${m.module}: ${m.count}`);
        }
        if (d.note) lines.push(`_${String(d.note)}_`);
      }
      if (d.href) lines.push(`→ Open [${d.screen ?? "Documents"}](${d.href})`);
    } else if (f.tool === "documents_search") {
      const n = Number(d.matchCount ?? 0);
      lines.push(
        n > 0
          ? `**Document search:** ${n} permission-visible file(s)` +
              (d.searchHint ? ` matching “${d.searchHint}”` : "") +
              "."
          : `**Document search:** ${d.note ?? "No matching files in your readable modules."}`
      );
      const citations = d.citations as
        | { fileName?: string; module?: string; href?: string; citation?: string }[]
        | undefined;
      for (const c of (citations ?? []).slice(0, 6)) {
        const label = c.citation ?? c.fileName ?? "file";
        if (c.href) lines.push(`• [${label}](${c.href})`);
        else lines.push(`• ${label}`);
      }
      if (d.moneyDisclaimer) lines.push(`_${String(d.moneyDisclaimer)}_`);
    } else if (f.tool === "nova_pulse_search") {
      const n = Number(d.matchCount ?? 0);
      lines.push(
        n > 0
          ? `**NOVA Pulse:** ${n} recorded change(s)` +
              (d.personHint ? ` involving “${d.personHint}”` : "") +
              (d.lookbackDays != null ? ` (last ${d.lookbackDays} days)` : "") +
              "."
          : `**NOVA Pulse:** ${d.note ?? "No matching recorded changes in your visible scope."}`
      );
      const events = d.events as
        | {
            summary?: string;
            action?: string;
            actorName?: string;
            createdAt?: string;
            href?: string;
            fileName?: string | null;
            taskNo?: string | null;
          }[]
        | undefined;
      for (const ev of (events ?? []).slice(0, 8)) {
        const when = ev.createdAt
          ? new Date(ev.createdAt).toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        const who = ev.actorName ? ` · ${ev.actorName}` : "";
        const label = ev.summary ?? `${ev.action ?? "change"}`;
        if (ev.href) lines.push(`• [${label}](${ev.href})${who}${when ? ` · ${when}` : ""}`);
        else lines.push(`• ${label}${who}${when ? ` · ${when}` : ""}`);
      }
      if (d.disclaimer) lines.push(`_${String(d.disclaimer)}_`);
    } else if (f.tool === "settings_open") {
      const company = d.companyName ? String(d.companyName) : null;
      lines.push(
        `**${d.screen ?? "Settings"}:** ${
          company
            ? `${company}` +
              (d.timezone ? ` · ${d.timezone}` : "") +
              (d.activeUserCount != null ? ` · ${d.activeUserCount} active user(s)` : "")
            : d.note ?? "Open Settings in the ERP."
        }`
      );
      if (d.note && company) lines.push(`_${String(d.note)}_`);
      const related = d.related as { title?: string; href?: string }[] | undefined;
      for (const r of (related ?? []).slice(0, 4)) {
        if (r.title && r.href) lines.push(`• ${r.title} — ${r.href}`);
      }
    } else if (f.tool === "appearance_open") {
      lines.push(
        `**${d.screen ?? "Appearance"}:** ${d.note ?? "Open Appearance to change theme or language."}`
      );
      if (d.href) lines.push(`→ Open [Appearance](${d.href})`);
    } else if (f.tool === "vendor_bank_open") {
      if (d.activeVendorCount != null) {
        lines.push(
          `**Vendor bank / beneficiary:** ${d.withBankDetails ?? 0} of ${d.activeVendorCount} active vendor(s) have bank/UPI details on file` +
            (d.missingBankDetails != null ? ` (${d.missingBankDetails} missing).` : ".")
        );
      } else {
        lines.push(
          `**Vendor bank / beneficiary:** ${d.note ?? "Open Vendors in the ERP to view bank details."}`
        );
      }
      if (d.note && d.activeVendorCount != null) lines.push(`_${String(d.note)}_`);
      if (d.href) lines.push(`→ Open [Vendors](${d.href})`);
    } else if (
      f.tool === "notifications_open" ||
      f.tool === "whatsapp_open" ||
      f.tool === "portal_open" ||
      f.tool === "automation_open" ||
      f.tool === "links_open" ||
      f.tool === "bank_sms_open" ||
      f.tool === "backup_open" ||
      f.tool === "system_tools_open" ||
      f.tool === "audit_log_open"
    ) {
      const title = String(d.screen ?? f.tool.replace(/_open$/, "").replace(/_/g, " "));
      if (f.tool === "notifications_open" && d.unreadCount != null) {
        lines.push(`**${title}:** ${d.note ?? `${d.unreadCount} unread.`}`);
      } else {
        lines.push(`**${title}:** ${d.note ?? `Open ${title} in the ERP.`}`);
      }
      if (d.href) lines.push(`→ Open [${title}](${d.href})`);
      const related = d.related as { title?: string; href?: string }[] | undefined;
      for (const r of (related ?? []).slice(0, 4)) {
        if (r.title && r.href) lines.push(`• ${r.title} — ${r.href}`);
      }
    }
  }

  if (lines.length === 0) return null;
  return [`${deterministicLeadIn(query, facts)}`, "", ...lines].join("\n");
}

/** Short lead-in; avoid echoing the raw query for clear attendance focuses. */
function deterministicLeadIn(query: string, facts: NovaToolFact[]): string {
  const att = facts.find((f) => f.ok !== false && f.tool === "attendance_late_summary" && f.data);
  const focus = att?.data ? String(att.data.focus ?? "") : "";
  if (focus === "absent") return "Here’s who was absent:";
  if (focus === "present") return "Here’s who was present:";
  if (focus === "punch_out") return "Here’s the punch-out list:";
  if (focus === "overview") return "Here’s the attendance summary:";
  if (focus === "late") return "Here’s the late list:";
  return `Here’s what I found for “${query}”:`;
}

const ABSENCE_NOTE =
  "_Note: Recorded absences count register missing-punch-in / unpaid leave rows only — days with no row are not counted as absent._";

function personLabel(p: { name?: string; code?: string }): string {
  return `${p.name ?? "?"}${p.code ? ` (${p.code})` : ""}`;
}

function pushBulletSection(lines: string[], title: string, items: string[]) {
  if (!items.length) return;
  lines.push(`**${title}**`);
  for (const item of items) lines.push(`- ${item}`);
}

/** Polished attendance cards — counts from facts only; bullet lists (no semicolon packs). */
function formatAttendancePolished(lines: string[], d: Record<string, unknown>) {
  if (d.message) {
    lines.push(String(d.message));
    return;
  }

  const focus = String(d.focus ?? "late");
  const singleDay = d.periodGrain === "day" || (d.from != null && d.from === d.to);
  const scopeLabel = formatNovaScopeLabel(d.scope);
  const periodBit = String(d.period ?? "");
  const headerCtx = [periodBit, scopeLabel].filter(Boolean).join(", ");

  const subj = d.subjectAttendance as
    | {
        name?: string;
        status?: string | null;
        isPresent?: boolean;
        isAbsent?: boolean;
        isLate?: boolean;
        lateMinutes?: number;
        punchInLabel?: string | null;
        punchOutLabel?: string | null;
      }
    | null
    | undefined;

  if (subj?.name) {
    const status = subj.status ?? "no row";
    if (focus === "punch_out" && subj.isPresent) {
      if (subj.punchOutLabel) {
        lines.push(
          `**${subj.name}** punched out at **${subj.punchOutLabel}** (${periodBit})` +
            (subj.punchInLabel ? ` — IN at ${subj.punchInLabel}.` : ".")
        );
      } else {
        lines.push(
          `**${subj.name}** has **no punch out yet** (${periodBit})` +
            (subj.punchInLabel ? ` — IN at ${subj.punchInLabel}.` : ".")
        );
      }
      return;
    }
    if (subj.isPresent) {
      lines.push(
        `**${subj.name}** was **present** (${periodBit})` +
          (subj.isLate && subj.punchInLabel
            ? ` — punched in at ${subj.punchInLabel} (${subj.lateMinutes} min late).`
            : subj.isLate
              ? ` — ${subj.lateMinutes} min late.`
              : ".")
      );
    } else if (status === "MISSING_PUNCH_IN") {
      lines.push(
        `**${subj.name}** was **not present** (${periodBit}) — status **missing punch in** (no IN punch on the register).`
      );
    } else if (status === "MISSING_PUNCH_OUT") {
      lines.push(
        `**${subj.name}** has **missing punch out** (${periodBit})` +
          (subj.punchInLabel ? ` — IN at ${subj.punchInLabel}.` : ".")
      );
    } else if (status === "no row" || status == null) {
      lines.push(
        `**${subj.name}** has **no attendance row** / did **not punch in** (${periodBit}).`
      );
    } else {
      lines.push(
        `**${subj.name}** was **absent** / not present (${periodBit})` +
          (status && status !== "no row"
            ? ` — status **${String(status).replaceAll("_", " ").toLowerCase()}**.`
            : ".")
      );
    }
    return;
  }

  const topA = d.topAbsent as { name?: string; code?: string; absentDays?: number }[] | undefined;
  const topP = d.topPresent as { name?: string; code?: string; presentDays?: number }[] | undefined;
  const topL = d.topLateComers as
    | {
        name?: string;
        code?: string;
        totalLateMinutes?: number;
        lateDays?: number;
        punchInLabel?: string | null;
      }[]
    | undefined;

  if (focus === "absent") {
    lines.push(`**Absentees** (${headerCtx || periodBit})`);
    if (singleDay) {
      lines.push(
        `- **${d.absentDays ?? topA?.length ?? 0}** people absent (includes missing punch in)`
      );
      pushBulletSection(
        lines,
        "Absent",
        (topA ?? []).slice(0, 8).map((p) => personLabel(p))
      );
    } else {
      lines.push(
        `- **${d.absentDays ?? 0}** recorded absence entries (employee-days; includes missing punch in)`
      );
      lines.push(ABSENCE_NOTE);
      pushBulletSection(
        lines,
        "Most absent",
        (topA ?? []).slice(0, 5).map((p) => `${personLabel(p)} — ${p.absentDays}d`)
      );
    }
    return;
  }

  if (focus === "present") {
    lines.push(`**Present** (${headerCtx || periodBit})`);
    if (singleDay) {
      lines.push(`- **${d.presentPunchDays ?? topP?.length ?? 0}** people punched in`);
      const presentWithTimes = topP as
        | {
            name?: string;
            code?: string;
            punchInLabel?: string | null;
            lateMinutes?: number;
            isLate?: boolean;
            status?: string | null;
          }[]
        | undefined;
      pushBulletSection(
        lines,
        "Punched in",
        (presentWithTimes ?? []).slice(0, 12).map((p) => {
          const label = personLabel(p);
          if (p.punchInLabel && p.isLate && Number(p.lateMinutes ?? 0) > 0) {
            return `${label} — ${p.punchInLabel} (${p.lateMinutes} min late)`;
          }
          if (p.punchInLabel) {
            const mpo =
              p.status === "MISSING_PUNCH_OUT" ? " · missing punch out" : "";
            return `${label} — ${p.punchInLabel}${mpo}`;
          }
          return label;
        })
      );
      if ((topP ?? []).length === 0) {
        lines.push("No one has punched in yet for this day.");
      }
    } else {
      lines.push(`- **${d.presentPunchDays ?? 0}** recorded employee present-days`);
      pushBulletSection(
        lines,
        "Most present",
        (topP ?? []).slice(0, 5).map((p) => `${p.name ?? "?"} — ${p.presentDays}d`)
      );
    }
    return;
  }

  if (focus === "punch_out") {
    lines.push(`**Punch out** (${headerCtx || periodBit})`);
    if (singleDay) {
      lines.push(`- **${d.presentPunchDays ?? topP?.length ?? 0}** people punched in`);
      const outRows = topP as
        | {
            name?: string;
            code?: string;
            punchInLabel?: string | null;
            punchOutLabel?: string | null;
            status?: string | null;
          }[]
        | undefined;
      pushBulletSection(
        lines,
        "Out times",
        (outRows ?? []).slice(0, 12).map((p) => {
          const label = personLabel(p);
          if (p.punchOutLabel) {
            return p.punchInLabel
              ? `${label} — OUT ${p.punchOutLabel} (IN ${p.punchInLabel})`
              : `${label} — OUT ${p.punchOutLabel}`;
          }
          if (p.status === "MISSING_PUNCH_OUT" || !p.punchOutLabel) {
            return p.punchInLabel
              ? `${label} — no punch out yet (IN ${p.punchInLabel})`
              : `${label} — no punch out yet`;
          }
          return label;
        })
      );
      if ((topP ?? []).length === 0) {
        lines.push("No one has punched in yet for this day — no punch-out times.");
      }
    } else {
      lines.push(`- **${d.presentPunchDays ?? 0}** recorded employee present-days`);
      lines.push("_Ask for a specific day to list punch-out timestamps._");
      pushBulletSection(
        lines,
        "Most present",
        (topP ?? []).slice(0, 5).map((p) => `${p.name ?? "?"} — ${p.presentDays}d`)
      );
    }
    return;
  }

  if (focus === "overview") {
    lines.push(`**Attendance** (${headerCtx || periodBit})`);
    if (singleDay) {
      lines.push(`- **${d.presentPunchDays ?? 0}** punched in`);
      lines.push(`- **${d.absentDays ?? 0}** absent`);
      lines.push(`- **${d.peopleWithLate ?? 0}** late`);
    } else {
      lines.push(`- **${d.presentPunchDays ?? 0}** recorded employee present-days`);
      lines.push(`- **${d.absentDays ?? 0}** recorded absence entries (employee-days)`);
      lines.push(
        `- **${d.peopleWithLate ?? 0}** people late across **${d.lateDayCount ?? 0}** late day(s)`
      );
      lines.push(ABSENCE_NOTE);
    }
    const overviewPresent = topP as
      | {
          name?: string;
          code?: string;
          presentDays?: number;
          punchInLabel?: string | null;
          lateMinutes?: number;
          isLate?: boolean;
        }[]
      | undefined;
    pushBulletSection(
      lines,
      singleDay ? "Punched in" : "Most present",
      (overviewPresent ?? [])
        .slice(0, singleDay ? 8 : 5)
        .map((p) => {
          if (!singleDay) return `${p.name ?? "?"} — ${p.presentDays}d`;
          const label = personLabel(p);
          if (p.punchInLabel && p.isLate && Number(p.lateMinutes ?? 0) > 0) {
            return `${label} — ${p.punchInLabel} (${p.lateMinutes} min late)`;
          }
          if (p.punchInLabel) return `${label} — ${p.punchInLabel}`;
          return label;
        })
    );
    pushBulletSection(
      lines,
      singleDay ? "Absent" : "Most absent",
      (topA ?? [])
        .slice(0, singleDay ? 8 : 5)
        .map((p) => (singleDay ? personLabel(p) : `${personLabel(p)} — ${p.absentDays}d`))
    );
    pushBulletSection(
      lines,
      singleDay ? "Late" : "Top late comers",
      (topL ?? [])
        .slice(0, singleDay ? 8 : 5)
        .map((p) =>
          singleDay && p.punchInLabel
            ? `${p.name} — punched in at ${p.punchInLabel} (${p.totalLateMinutes} min late)`
            : singleDay
              ? `${p.name} (${p.totalLateMinutes} min)`
              : `${p.name} (${p.totalLateMinutes} min / ${p.lateDays}d)`
        )
    );
    return;
  }

  // focus === late (default)
  lines.push(`**Late comers** (${headerCtx || periodBit})`);
  if (singleDay) {
    lines.push(`- **${d.peopleWithLate ?? 0}** people late`);
    if (d.presentPunchDays != null) lines.push(`- **${d.presentPunchDays}** punched in`);
    if (d.absentDays != null) lines.push(`- **${d.absentDays}** absent`);
    const most = d.mostLate as {
      name?: string;
      code?: string;
      totalLateMinutes?: number;
      punchInLabel?: string | null;
    } | null;
    if (most?.name) {
      const punchBit = most.punchInLabel ? `punched in at ${most.punchInLabel}` : null;
      lines.push(
        `- **Most late:** ${most.name} (${most.code}) — ` +
          (punchBit
            ? `${punchBit} (${most.totalLateMinutes} min late)`
            : `${most.totalLateMinutes} min`)
      );
    }
    pushBulletSection(
      lines,
      "Late",
      (topL ?? []).slice(0, 8).map((p) =>
        p.punchInLabel
          ? `${p.name} — punched in at ${p.punchInLabel} (${p.totalLateMinutes} min late)`
          : `${p.name} (${p.totalLateMinutes} min)`
      )
    );
    if ((topL ?? []).length === 0) {
      lines.push("No one was late for this day.");
    }
  } else {
    lines.push(
      `- **${d.peopleWithLate ?? 0}** people late across **${d.lateDayCount ?? 0}** late day(s)`
    );
    if (d.presentPunchDays != null) {
      lines.push(`- **${d.presentPunchDays}** recorded employee present-days`);
    }
    if (d.absentDays != null) {
      lines.push(`- **${d.absentDays}** recorded absence entries (employee-days)`);
    }
    const most = d.mostLate as {
      name?: string;
      code?: string;
      lateDays?: number;
      totalLateMinutes?: number;
    } | null;
    if (most?.name) {
      lines.push(
        `- **Most late:** ${most.name} (${most.code}) — ${most.totalLateMinutes} min total over ${most.lateDays} day(s)`
      );
    }
    pushBulletSection(
      lines,
      "Top late comers",
      (topL ?? [])
        .slice(0, 5)
        .map((p) => `${p.name} (${p.totalLateMinutes} min / ${p.lateDays}d)`)
    );
  }
}

type NovaFactLike = {
  tool: string;
  ok?: boolean;
  data?: Record<string, unknown>;
};

/**
 * Single-day late-comer answers must surface punch-in times when facts include them.
 * Rejects aggregate-only copy and “punched in” voice that never states the clock time.
 */
export function llmPreservesLatePunchTimes(answer: string, facts: NovaFactLike[]): boolean {
  const att = facts.find((f) => f.ok !== false && f.tool === "attendance_late_summary" && f.data);
  if (!att?.data) return true;
  const d = att.data;
  const singleDay = d.periodGrain === "day" || (d.from != null && d.from === d.to);
  if (!singleDay) return true;
  if (String(d.focus ?? "late") !== "late") return true;
  const top = d.topLateComers as { punchInLabel?: string | null }[] | undefined;
  const labels = (top ?? [])
    .map((p) => (typeof p.punchInLabel === "string" ? p.punchInLabel.trim() : ""))
    .filter(Boolean);
  if (labels.length === 0) return true;
  // Require an actual fact label (e.g. "10:20 am") — bare “punched in” is not enough.
  const normalized = answer.toLowerCase().replace(/\u202f|\u00a0/g, " ");
  return labels.some((lab) => normalized.includes(lab.toLowerCase().replace(/\u202f|\u00a0/g, " ")));
}

/**
 * Reject answers that attribute punch-in times to staff not present in late facts
 * (history bleed / hallucination — e.g. yesterday’s Madhu time on “today’s attendance”).
 * Fail closed: when facts have no late names, reject invented person + late/punch lines.
 */
export function llmPreservesLateStaffNames(answer: string, facts: NovaFactLike[]): boolean {
  const att = facts.find((f) => f.ok !== false && f.tool === "attendance_late_summary" && f.data);
  if (!att?.data) return true;
  const d = att.data;
  if (String(d.focus ?? "late") !== "late") return true;
  // Person-resolved messages — defer to presence guard / subject copy
  if (d.message) return true;
  const top = (d.topLateComers as { name?: string }[] | undefined) ?? [];
  const most = d.mostLate as { name?: string } | null | undefined;
  const allowed = new Set<string>();
  for (const p of top) {
    const n = typeof p?.name === "string" ? p.name.trim().toLowerCase() : "";
    if (n) {
      allowed.add(n);
      allowed.add(n.split(/\s+/)[0]!);
    }
  }
  if (most?.name) {
    const n = most.name.trim().toLowerCase();
    allowed.add(n);
    allowed.add(n.split(/\s+/)[0]!);
  }

  // “Name … punched in …” OR bullet “Name … (N min late)” without requiring “punched in”
  const attributed = [
    ...answer.matchAll(
      /\b([A-Za-z][A-Za-z'.-]{0,40}(?:\s+[A-Za-z][A-Za-z'.-]{0,30}){0,3})\s*(?:\([^)]{0,24}\))?\s+punched\s+in\b/gi
    ),
    ...answer.matchAll(
      /(?:^|\n)\s*[-*•]?\s*\*?\*?([A-Za-z][A-Za-z'.-]{0,40}(?:\s+[A-Za-z][A-Za-z'.-]{0,30}){0,3})\*?\*?\s+(?:punched|came|\(|—|-).*?\b\d+\s*min(?:ute)?s?\s+late\b/gi
    ),
  ];
  if (attributed.length === 0) return true;

  // Empty late list → any named late person is invented
  if (allowed.size === 0) return false;

  for (const m of attributed) {
    const raw = m[1]?.trim().toLowerCase() ?? "";
    if (!raw || raw.length < 2) continue;
    // Prefer longest allowed match (full name), then first token
    if (allowed.has(raw)) continue;
    const first = raw.split(/\s+/).find((t) => t.length >= 2) ?? raw.split(/\s+/)[0]!;
    if (allowed.has(first)) continue;
    // Last token helps “Arun C Michael” when only “Michael” was captured
    const parts = raw.split(/\s+/).filter((t) => t.length >= 2);
    const last = parts[parts.length - 1];
    if (last && [...allowed].some((a) => a === last || a.endsWith(` ${last}`) || a.split(/\s+/).includes(last))) {
      continue;
    }
    return false;
  }
  return true;
}

/**
 * When subjectAttendance says not present (e.g. MISSING_PUNCH_IN), reject answers
 * that claim the person was present / punched in / came in.
 */
export function llmPreservesAttendancePresence(answer: string, facts: NovaFactLike[]): boolean {
  const att = facts.find((f) => f.ok !== false && f.tool === "attendance_late_summary" && f.data);
  if (!att?.data) return true;
  const subj = att.data.subjectAttendance as
    | {
        name?: string;
        isPresent?: boolean;
        status?: string | null;
        punchInTime?: string | null;
      }
    | null
    | undefined;
  if (!subj?.name || subj.isPresent) return true;
  const a = answer.toLowerCase();
  const negated = /\b(not|wasn't|wasnt|isn't|isnt|no|never|didn't|didnt|hasn't|hasnt)\b/.test(a);
  const missingPunch = /\bmissing\s+punch\b/.test(a);
  // Claim of presence without negation
  if (/\bwas\s+present\b/.test(a) || /\bis\s+present\b/.test(a)) {
    if (!negated && !missingPunch) return false;
  }
  // Claim they punched / came in when register has no IN
  if (
    !subj.punchInTime &&
    (subj.status === "MISSING_PUNCH_IN" ||
      subj.status === "ABSENT" ||
      subj.status == null ||
      subj.isPresent === false) &&
    /\b(punched\s+in|punch\s+in\s+at|came\s+in\s+at|showed\s+up|is\s+here|was\s+here)\b/.test(a) &&
    !negated &&
    !missingPunch
  ) {
    return false;
  }
  return true;
}

/**
 * Punch-out asks must not be rewritten as late lists, and must surface OUT times
 * (or “no punch out yet”) when facts include present staff.
 */
export function llmPreservesPunchOutFocus(answer: string, facts: NovaFactLike[]): boolean {
  const att = facts.find((f) => f.ok !== false && f.tool === "attendance_late_summary" && f.data);
  if (!att?.data) return true;
  const d = att.data;
  if (String(d.focus ?? "") !== "punch_out") return true;
  if (d.message) return true;

  const a = answer.toLowerCase();
  if (/\bhere(?:'|’)s the late list\b/.test(a) || /\bmin(?:ute)?s?\s+late\b/.test(a)) {
    return false;
  }

  const top =
    (d.topPresent as { punchOutLabel?: string | null; punchInLabel?: string | null }[] | undefined) ??
    [];
  if (top.length === 0) return true;

  const hasOutLabel = top.some(
    (p) => typeof p.punchOutLabel === "string" && p.punchOutLabel.trim().length > 0
  );
  const mentionsOut =
    /\bno\s+punch\s+out\s+yet\b/.test(a) ||
    /\bpunched\s+out\b/.test(a) ||
    /\bout\s+times?\b/.test(a) ||
    /\bpunch-?out\b/.test(a) ||
    (hasOutLabel &&
      top.some((p) => {
        const lab = typeof p.punchOutLabel === "string" ? p.punchOutLabel.trim() : "";
        return lab && a.includes(lab.toLowerCase().replace(/\u202f|\u00a0/g, " "));
      }));
  return mentionsOut;
}

type Entity360Party = { type?: string; code?: string | null; name?: string | null } | null;
type Entity360Ref = { id?: string | null; name?: string | null } | null;
type Entity360Approvals = {
  manager?: string;
  admin?: string;
  payment?: string;
  reconciliation?: string;
  adminOverride?: boolean;
};
type Entity360History = { action?: string; at?: string; note?: string | null };
type Entity360Bank = {
  visible?: boolean;
  note?: string;
  vendorBankAccountName?: string | null;
  vendorBankAccountNumber?: string | null;
  vendorIfsc?: string | null;
  vendorUpiId?: string | null;
};

function dateOnly(iso: unknown): string | null {
  if (typeof iso !== "string" || !iso.trim()) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/** Deterministic Entity 360 card (payment request). Never sent to the LLM. */
export function formatEntity360Fact(d: Record<string, unknown>): string | null {
  if (d.notFound || d.notRecognized || d.unsupportedKind) {
    return d.message ? String(d.message) : null;
  }
  if (d.kind !== "payment_request") {
    return d.message ? String(d.message) : null;
  }

  const out: string[] = [];
  out.push(`**Payment request ${d.identifier}** — ${d.statusLabel ?? d.status}`);

  // Overview
  const overview: string[] = [];
  if (d.amountInr) overview.push(`**Amount:** ${d.amountInr}`);
  const party = d.party as Entity360Party;
  if (party?.name) {
    const label = party.code ? `${party.code} · ${party.name}` : party.name;
    overview.push(`**Party (${party.type ?? "party"}):** ${label}`);
  }
  if (d.purpose) overview.push(`**Purpose:** ${d.purpose}`);
  if (d.category) overview.push(`**Category:** ${d.category}`);
  const project = d.project as Entity360Ref;
  if (project?.id) {
    overview.push(`**Project:** ${project.name ? `${project.id} · ${project.name}` : project.id}`);
  }
  const requestedAt = dateOnly(d.requestedAt);
  if (d.createdByName) {
    overview.push(`**Posted by:** ${d.createdByName}${requestedAt ? ` on ${requestedAt}` : ""}`);
  }
  if (d.createdForName) overview.push(`**On behalf of:** ${d.createdForName}`);
  const pb = d.purchaseBill as { code?: string; invoiceNumber?: string } | null;
  if (pb?.code) {
    overview.push(`**Purchase bill:** ${pb.code}${pb.invoiceNumber ? ` (${pb.invoiceNumber})` : ""}`);
  }
  for (const line of overview) out.push(`• ${line}`);

  // Approval chain / status
  const ap = d.approvals as Entity360Approvals | undefined;
  if (ap) {
    const parts = [
      `Manager ${ap.manager ?? "—"}`,
      `Admin ${ap.admin ?? "—"}`,
      `Payment ${ap.payment ?? "—"}`,
      `Reconciliation ${String(ap.reconciliation ?? "—").replace(/_/g, " ")}`,
    ];
    if (ap.adminOverride) parts.push("Admin override");
    out.push(`**Approval chain:** ${parts.join(" · ")}`);
  }
  const paidAt = dateOnly(d.paidAt);
  if (paidAt) {
    out.push(`**Paid:** ${paidAt}${d.paidByName ? ` by ${d.paidByName}` : ""}${d.paidFromBankLabel ? ` from ${d.paidFromBankLabel}` : ""}`);
  }

  // Vendor beneficiary details (RBAC-gated)
  const bank = d.vendorPaymentDetails as Entity360Bank | null;
  if (bank) {
    if (bank.visible) {
      const b: string[] = [];
      if (bank.vendorUpiId) b.push(`UPI ${bank.vendorUpiId}`);
      if (bank.vendorBankAccountNumber) {
        b.push(`A/c ${bank.vendorBankAccountNumber}${bank.vendorIfsc ? ` (${bank.vendorIfsc})` : ""}`);
      } else if (bank.vendorIfsc) {
        b.push(`IFSC ${bank.vendorIfsc}`);
      }
      if (bank.vendorBankAccountName) b.push(`Name ${bank.vendorBankAccountName}`);
      out.push(b.length ? `**Vendor payment details:** ${b.join(" · ")}` : "**Vendor payment details:** none on file.");
    } else {
      out.push(`**Vendor payment details:** ${bank.note ?? "hidden for your role."}`);
    }
  }

  // Recent approval history
  const history = (d.approvalHistory as Entity360History[] | undefined) ?? [];
  if (history.length) {
    out.push("**Approval history:**");
    for (const h of history.slice(0, 6)) {
      const when = dateOnly(h.at);
      out.push(`• ${h.action ?? "—"}${when ? ` — ${when}` : ""}${h.note ? ` (${h.note})` : ""}`);
    }
  }

  // Suggested next actions
  const actions = (d.nextActions as string[] | undefined) ?? [];
  if (actions.length) {
    out.push("**Suggested next steps:**");
    for (const a of actions) out.push(`• ${a}`);
  }

  return out.join("\n");
}

