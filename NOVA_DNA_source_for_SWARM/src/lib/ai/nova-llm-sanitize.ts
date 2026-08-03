/**
 * Minimize / redact NOVA tool facts before sending to an external LLM.
 * Prefer per-tool field allow-lists for sensitive tools; otherwise strip
 * PII/financial identifiers by key pattern and cap payload size.
 */

const MAX_ARRAY = 8;
const MAX_STRING = 160;
const MAX_DEPTH = 6;

/** Keys always redacted (case-insensitive substring / whole-key match). */
const SENSITIVE_KEY =
  /^(accountNumber|iban|ifsc|pan|aadhaar|password|secret|token|accessToken|refreshToken|apiKey|upiId|upiVpa|vpa|gstin|phone|mobile|email|address|postalAddress|bankAccount|accountNo|maskedAccount|salary|netPay|grossPay|basicPay|deduction|narration|bankNarration|smsBody|rawMessage|aadhar)$/i;

const SENSITIVE_KEY_PARTIAL =
  /(accountNumber|iban|ifsc|panNumber|aadhaar|password|secret|token|upi|gstin|phone|mobile|email|address|salary|netPay|grossPay|narration|rawMessage|smsBody|bankAccount)/i;

/**
 * Per-tool allow-lists for high-sensitivity tools.
 * Only listed keys (plus nested aggregate numbers under allowed parents) are kept.
 * Tools not listed use the global key redaction path.
 *
 * NOVA-06: expand coverage for HR queues, masters, and money samples that
 * previously relied only on key-pattern redaction.
 */
const TOOL_ALLOW: Record<string, Set<string>> = {
  salary_summary: new Set([
    "periodLabel",
    "period",
    "periodGrain",
    "periodSource",
    "from",
    "to",
    "employeeCount",
    "payslipCount",
    "paidCount",
    "unpaidCount",
    "payrollRunCount",
    "paymentsInPeriod",
    "scope",
    "selfOnly",
    "subject",
    "personFilter",
    "name",
    "relation",
    "staffCode",
    "resolved",
    "note",
    // Aggregate money only — never samples with names/net pay breakdown
    "paidTotal",
    "paidTotalInr",
    "unpaidTotal",
    "unpaidTotalInr",
    "grossTotal",
    "grossTotalInr",
    "netTotal",
    "netTotalInr",
  ]),
  bank_accounts_summary: new Set([
    "accountCount",
    "activeCount",
    "totalBalance",
    "totalBalanceInr",
    "operationalBalance",
    "operationalBalanceInr",
    "note",
    "sources",
    "freshness",
    "period",
  ]),
  bank_recon_summary: new Set([
    "periodLabel",
    "from",
    "to",
    "matchedCount",
    "unmatchedCount",
    "statementCount",
    "bookCount",
    "differenceTotal",
    "differenceTotalInr",
    "note",
    "sources",
    "freshness",
    "period",
  ]),
  bank_sms_open: new Set(["href", "title", "pendingCount", "note"]),
  nova_analysis: new Set([
    "domain",
    "headline",
    "subject",
    "position",
    "methodology",
    "deterministicNarrative",
    "llmNarrative",
    "primaryNarrative",
    "narrativeSource",
    "rateLimited",
    "findingsFormatted",
    "factorCount",
    "schemaVersion",
    "note",
    "empty",
    "planned",
    "priority",
    "message",
    "sources",
    "freshness",
    "period",
  ]),
  vendor_bank_open: new Set([
    "href",
    "title",
    "screen",
    "note",
    "activeVendorCount",
    "withBankDetails",
    "missingBankDetails",
    "sources",
    "freshness",
    "period",
  ]),
  staff_summary: new Set([
    "activeCount",
    "inactiveCount",
    "totalCount",
    "departmentCount",
    "note",
  ]),
  staff_advances_summary: new Set([
    "periodLabel",
    "from",
    "to",
    "openCount",
    "settledCount",
    "openTotal",
    "openTotalInr",
    "settledTotal",
    "settledTotalInr",
    "scope",
    "subject",
    "personFilter",
    "name",
    "relation",
    "staffCode",
    "resolved",
    "note",
  ]),
  attendance_late_summary: new Set([
    // Period / scope (tool uses `period`, not periodLabel)
    "period",
    "periodGrain",
    "periodSource",
    "from",
    "to",
    "scope",
    "focus",
    "note",
    // Counts — real field names from attendance_late_summary
    "peopleWithLate",
    "latePeopleCount",
    "lateDayCount",
    "presentPunchDays",
    "absentDays",
    // Ranked people (names required so LLM cannot invent staff)
    "mostLate",
    "topLateComers",
    "topAbsent",
    "topPresent",
    "mostAbsent",
    "mostPresent",
    "subject",
    "subjectAttendance",
    // Nested person / punch fields
    "name",
    "code",
    "department",
    "lateDays",
    "absentDays",
    "presentDays",
    "totalLateMinutes",
    "lateMinutes",
    "avgLateMinutes",
    "punchInLabel",
    "punchInTime",
    // Punch-out focus — without these, hybrid LLM never sees OUT times (v3.0.36 gap).
    "punchOutLabel",
    "punchOutTime",
    "date",
    "status",
    "isPresent",
    "isAbsent",
    "isLate",
    "earlyMinutes",
    "overtimeMinutes",
    "staleLateExcluded",
    "staleLateExcludedDays",
    "sampleCap",
    "sampleCapped",
    "relation",
    "message",
    "staffCode",
    "resolved",
    "sources",
    "freshness",
  ]),
  leave_summary: new Set([
    "scope",
    "subject",
    "personFilter",
    "period",
    "periodSource",
    "pendingCount",
    "approvedOverlappingPeriod",
    "approvedDaysUsed",
    "leaveTypes",
    "balancesByType",
    "entitlementBalances",
    "balanceNote",
    "monthSnapshot",
    "upcomingApproved",
    "samples",
    "note",
    "message",
    // nested subject / sample / type fields
    "name",
    "relation",
    "staffCode",
    "resolved",
    "staff",
    "code",
    "type",
    "from",
    "to",
    "days",
    "status",
    "paid",
    "attendanceEffect",
    "annualAllowanceDays",
    "carryForwardMaxDays",
    "accrualMode",
    "requestCount",
    "carriedForwardDays",
    "usedDays",
    "remainingDays",
    "year",
    "month",
    "leaveRequestsInMonth",
    "approvedInMonth",
    "pendingInMonth",
    "byType",
    "attendanceSummary",
    "presentDays",
    "absentDays",
    "paidLeaveDays",
    "unpaidLeaveDays",
    "lateCount",
  ]),
  overtime_summary: new Set([
    "scope",
    "focus",
    "pendingCount",
    "approvedCount",
    "rejectedCount",
    "sampleStatus",
    "samples",
    "note",
    "message",
    "id",
    "name",
    "code",
    "date",
    "overtimeMinutes",
    "payMode",
    "status",
    "reason",
  ]),
  regularisation_summary: new Set([
    "scope",
    "focus",
    "pendingCount",
    "approvedCount",
    "rejectedCount",
    "sampleStatus",
    "samples",
    "note",
    "message",
    "id",
    "name",
    "code",
    "date",
    "requestType",
    "reason",
    "status",
  ]),
  payment_requests_summary: new Set([
    "scope",
    "period",
    "awaitingActionCount",
    "paidInPeriod",
    "samples",
    "sources",
    "freshness",
    "id",
    "status",
    "amountInr",
    "purpose",
    "href",
  ]),
  /**
   * Entity 360 is always presented deterministically (skip-LLM). This allow-list
   * is defense-in-depth for any future hybrid composition: it drops vendor
   * beneficiary details (vendorBankAccountNumber / vendorUpiId / vendorIfsc),
   * paymentNarration, and person names entirely — only safe display fields pass.
   */
  entity_360: new Set([
    "kind",
    "identifier",
    "notFound",
    "notRecognized",
    "unsupportedKind",
    "message",
    "href",
    "status",
    "statusLabel",
    "requestType",
    "partyType",
    "amount",
    "amountInr",
    "purpose",
    "category",
    "urgency",
    "gstApplicable",
    "tdsApplicable",
    "ageDays",
    "party",
    "type",
    "code",
    "project",
    "id",
    "purchaseBill",
    "invoiceNumber",
    "approvals",
    "manager",
    "admin",
    "payment",
    "reconciliation",
    "adminOverride",
    "approvalHistory",
    "action",
    // NOTE: paidFromBankLabel (payer company bank) is intentionally NOT allow-listed —
    // it is payment-posting detail. Entity 360 is deterministic-only; this is
    // defense-in-depth for any future hybrid composition.
    "bankDetailsVisible",
    "nextActions",
    "sources",
    "freshness",
    "period",
  ]),
  customer_outstanding: new Set([
    "customerFilter",
    "filterScope",
    "outstandingTotal",
    "outstandingTotalInr",
    "rowCount",
    "moneyNote",
    "top",
    "sources",
    "freshness",
    "period",
    "customer",
    "invoice",
    "outstanding",
    "outstandingInr",
    "days",
  ]),
  profitability_summary: new Set([
    "balancesVisible",
    "netFundsAvailableInr",
    "fundPosition",
    "cashInHand",
    "cashInHandInr",
    "positiveBank",
    "positiveBankInr",
    "netFundsAvailable",
    "odCcUtilised",
    "odCcUtilisedInr",
    "odCcAvailable",
    "odCcAvailableInr",
    "projectPlFocus",
    "projectPlScope",
    "projectPlScopeNote",
    "projectPlSot",
    "projectPlGapNote",
    "requestedPeriodLabel",
    "requestedPeriodApplied",
    "statusBreakdown",
    "lossMakingProjectCount",
    "profitableProjectCount",
    "breakEvenProjectCount",
    "lossProjects",
    "focusedProjectPlRows",
    "projectPlSample",
    "projectPlTotal",
    "moneyNote",
    "note",
    "sources",
    "freshness",
    "period",
    "project",
    "projectId",
    "status",
    "invoiced",
    "invoicedInr",
    "received",
    "receivedInr",
    "purchases",
    "purchasesInr",
    "margin",
    "marginInr",
    "outstanding",
    "outstandingInr",
  ]),
  vendors_summary: new Set([
    "activeCount",
    "totalCount",
    "entityFilter",
    "recentVendors",
    "sources",
    "freshness",
    "period",
    "id",
    "name",
    "active",
    "href",
  ]),
  customers_summary: new Set([
    "activeCount",
    "totalCount",
    "entityFilter",
    "recentCustomers",
    "sources",
    "freshness",
    "period",
    "id",
    "name",
    "company",
    "state",
    "active",
    "href",
  ]),
  staff_expense_summary: new Set([
    "period",
    "periodGrain",
    "periodSource",
    "totalPaidInr",
    "totalPaid",
    "manualPaid",
    "manualPaidInr",
    "paymentRequestPaid",
    "paymentRequestPaidInr",
    "pendingManualCount",
    "byType",
    "sampleCount",
    "samples",
    "emptyNote",
    "note",
    "entryType",
    "count",
    "amountInr",
    "voucher",
    "type",
    "purpose",
    "party",
    "paidAt",
    "source",
  ]),
  incentives_summary: new Set([
    "period",
    "periodGrain",
    "periodSource",
    "scope",
    "subject",
    "personFilter",
    "scopeNote",
    "openOrUnpaidCount",
    "sampleCount",
    "samples",
    "note",
    "message",
    "name",
    "relation",
    "staffCode",
    "resolved",
    "no",
    "staff",
    "code",
    "approval",
    "payment",
    "amountInr",
  ]),
  search_entities: new Set([
    "matchCount",
    "matches",
    "kind",
    "title",
    "subtitle",
    "href",
  ]),
};

/** Tools with explicit field allow-lists (NOVA-06). */
export function novaToolsWithFieldAllowList(): string[] {
  return Object.keys(TOOL_ALLOW).sort();
}

function truncateString(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_STRING) return t;
  return `${t.slice(0, MAX_STRING - 1)}…`;
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key) || SENSITIVE_KEY_PARTIAL.test(key);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((v) => sanitizeValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) {
        out[k] = "[redacted]";
        continue;
      }
      // Drop person-identifying sample rows under generic keys
      if (/^(samples?|rows?|items?|entries|people|employees|staff)$/i.test(k) && Array.isArray(v)) {
        out[k] = v.slice(0, MAX_ARRAY).map((row) => {
          if (row && typeof row === "object") {
            const slim: Record<string, unknown> = {};
            for (const [rk, rv] of Object.entries(row as Record<string, unknown>)) {
              if (isSensitiveKey(rk) || /^(name|fullName|employeeName|staffName|customerName|vendorName|phone|email|mobile)$/i.test(rk)) {
                slim[rk] = "[redacted]";
              } else if (typeof rv === "number" || typeof rv === "boolean") {
                slim[rk] = rv;
              } else if (typeof rv === "string" && /^(id|code|status|type|label|period)/i.test(rk)) {
                slim[rk] = truncateString(rv);
              }
            }
            return slim;
          }
          return sanitizeValue(row, depth + 1);
        });
        continue;
      }
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function pickAllowed(data: unknown, allow: Set<string>, depth = 0): unknown {
  if (data == null || depth > MAX_DEPTH) return data == null ? data : "[truncated]";
  if (typeof data !== "object") return sanitizeValue(data, depth);
  if (Array.isArray(data)) {
    return data.slice(0, MAX_ARRAY).map((v) => pickAllowed(v, allow, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (!allow.has(k)) continue;
    if (isSensitiveKey(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (v && typeof v === "object") {
      out[k] = pickAllowed(v, allow, depth + 1);
    } else {
      out[k] = sanitizeValue(v, depth + 1);
    }
  }
  return out;
}

export type NovaFactLike = {
  tool: string;
  ok: boolean;
  denied?: boolean;
  error?: string;
  data?: unknown;
};

/** Compact facts pack for LLM prompts (no full DB dumps). Denied tools never include data. */
export function sanitizeNovaFactsForLlm(facts: NovaFactLike[]): unknown[] {
  return facts.map((f) => {
    if (f.denied || !f.ok) {
      return {
        tool: f.tool,
        ok: false,
        denied: f.denied ?? false,
        // No data / no internal error strings — model must not invent denied facts
      };
    }
    const allow = TOOL_ALLOW[f.tool];
    const data =
      f.data == null
        ? undefined
        : allow
          ? pickAllowed(f.data, allow)
          : sanitizeValue(f.data, 0);
    return {
      tool: f.tool,
      ok: true,
      denied: false,
      data,
    };
  });
}
