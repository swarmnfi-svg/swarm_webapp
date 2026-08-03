/**
 * Language → form mapping + slot parse for NOVA safe workflow open (P1).
 * Prefill slots only — never implies a DB write.
 */

export type NovaSafeWorkflowFormId =
  | "payment_request_new"
  | "staff_advance"
  | "staff_reimbursement"
  | "purchase_request_new"
  | "task_new"
  | "task_edit"
  | "leave_new"
  | "regularisation_new";

export type NovaSafeWorkflowMatch =
  | {
      formId: "payment_request_new";
      hrefBase: "/payment-requests/new";
      type: "VENDOR_PAYMENT";
      vendorHint: string;
      amount: number;
      purpose?: string;
    }
  | {
      formId: "staff_advance";
      hrefBase: "/payment-requests/new";
      type: "STAFF_ADVANCE";
      amount?: number;
      purpose?: string;
    }
  | {
      formId: "staff_reimbursement";
      hrefBase: "/payment-requests/new";
      type: "STAFF_EXPENSE_REIMBURSEMENT";
      amount?: number;
      purpose?: string;
    }
  | {
      formId: "purchase_request_new";
      hrefBase: "/purchase-requests/new";
      vendorHint?: string;
      itemHint?: string;
      projectHint?: string;
      amount?: number;
      purpose?: string;
    }
  | {
      formId: "task_new";
      hrefBase: "/tasks/new";
      title: string;
      assigneeHint?: string;
      projectHint?: string;
    }
  | {
      formId: "task_edit";
      hrefBase: "/tasks";
      titleHint: string;
    }
  | {
      formId: "leave_new";
      hrefBase: "/attendance-hr/leave";
      leaveTypeHint?: string;
      fromDate?: string;
      toDate?: string;
      halfDayType?: "NONE" | "FIRST_HALF" | "SECOND_HALF";
      reason?: string;
    }
  | {
      formId: "regularisation_new";
      hrefBase: "/attendance-hr/regularisation";
      requestType?: string;
      date?: string;
      reason?: string;
    };

function coreQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[!?.,…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePositiveAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 1e12) return null;
  return Math.round(n * 100) / 100;
}

function parseOptionalAmount(q: string): number | undefined {
  const amountPatterns = [
    /\b(?:for|of|amount)\s*(?:of\s+)?(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?)\b/i,
    /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\b/i,
    /\b([\d,]+(?:\.\d+)?)\s*(?:rs\.?|inr|rupees?)\b/i,
  ];
  for (const re of amountPatterns) {
    const m = q.match(re);
    if (m?.[1]) {
      const amount = parsePositiveAmount(m[1]);
      if (amount != null) return amount;
    }
  }
  return undefined;
}

function parsePurpose(q: string): string | undefined {
  const purposeM = q.match(/\bpurpose\s*[:=]?\s+(.{3,120})$/i);
  return purposeM?.[1]?.trim().slice(0, 200) || undefined;
}

function isHowToFraming(q: string): boolean {
  return (
    /\bhow\s+(?:to|do\s+i|can\s+i|should\s+i)\b/.test(q) ||
    /\bwhat\s+(?:is|are)\s+the\s+steps\b/.test(q) ||
    /\bwhere\s+(?:do\s+i|can\s+i)\s+(?:create|make|open)\b/.test(q) ||
    /\bexplain\s+how\b/.test(q)
  );
}

/** True when utterance is an imperative approve/delete/pay mutation (never open-as-submit). */
export function isNovaSafeWorkflowHardWriteCue(query: string): boolean {
  const q = coreQuery(query);
  if (!q) return false;
  if (/\b(approve|reject|cancel)\s+(this|the|my|invoice|bill|payment|request|task|order)\b/.test(q)) {
    return true;
  }
  if (/\bplease\s+(approve|reject|delete|create|update)\b/.test(q)) return true;
  if (/\b(delete|remove|void|reverse|mark\s+paid)\b/.test(q)) return true;
  return false;
}

/** Purchase / materials indent — not payment request. */
export function isNovaPurchaseRequestCue(query: string): boolean {
  const q = coreQuery(query);
  return (
    /\bpurchase\s+requests?\b/.test(q) ||
    /\bmaterial\s+indents?\b/.test(q) ||
    /\bbuy\s+(material|materials|stock)\b/.test(q)
  );
}

function isPurchaseRequestCreateCue(q: string): boolean {
  if (!isNovaPurchaseRequestCue(q)) return false;
  return /\b(create|make|new|submit|open|raise|generate|start|indent)\b/.test(q);
}

function isTaskCreateCue(q: string): boolean {
  return (
    (/\b(create|make|new|open|raise|start|assign)\b/.test(q) && /\btasks?\b/.test(q)) ||
    /\bassign\s+(?:a\s+)?task\b/.test(q)
  );
}

/** Edit/update with a clear title — navigate to edit form only (never auto-submit). */
function isTaskEditCue(q: string): boolean {
  if (/\b(create|make|new|assign|raise|start)\b/.test(q)) return false;
  if (/\b(approve|reject|delete|archive|mark\s+complete|complete\s+task)\b/.test(q)) {
    return false;
  }
  return (
    /\b(edit|update|modify|change)\s+(?:a\s+|the\s+)?tasks?\b/.test(q) ||
    /\btasks?\s+(?:edit|update|modify)\b/.test(q)
  );
}

function extractTaskEditTitle(raw: string): string | null {
  const patterns = [
    /\b(?:edit|update|modify|change)\s+(?:a\s+|the\s+)?task\s+(?:titled|called|named)\s+["']?(.+?)["']?\s*$/i,
    /\b(?:edit|update|modify)\s+task\s+["']([^"']{2,200})["']/i,
    /\btask\s+(?:titled|called|named)\s+["']?(.+?)["']?\s+(?:edit|update|modify)\b/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const title = m[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\s+(?:please|now|form)?\s*$/i, "")
        .slice(0, 200);
      if (title.length >= 2) return title;
    }
  }
  return null;
}

function isStaffAdvanceCreateCue(q: string): boolean {
  if (/\breimburse/.test(q)) return false;
  return (
    /\b(staff\s+advance|advance\s+request|request\s+(?:a\s+)?advance)\b/.test(q) ||
    (/\badvance\b/.test(q) && /\b(create|request|open|new|raise)\b/.test(q))
  );
}

function isStaffReimbursementCreateCue(q: string): boolean {
  return (
    (/\b(staff\s+)?(reimbursement|expense\s+claim|expense\s+reimbursement|reimburse\s+expenses?)\b/.test(
      q
    ) &&
      /\b(create|request|open|new|raise|file|submit|claim)\b/.test(q)) ||
    /\bclaim\s+expenses?\b/.test(q)
  );
}

function isPaymentRequestCreateCue(q: string): boolean {
  if (isNovaPurchaseRequestCue(q)) return false;
  const paymentNoun =
    /\bpayment\s+requests?\b/.test(q) ||
    /\bvendor\s+payments?\b/.test(q) ||
    (/\bpay\b/.test(q) && /\bvendor\b/.test(q));
  if (!paymentNoun) return false;
  const createVerb =
    /\b(create|make|new|submit|open|raise|generate|start)\b/.test(q) ||
    /\b(pay\s+vendor|vendor\s+payment)\b/.test(q);
  return createVerb;
}

function isIsoDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

function isLeaveCreateCue(q: string): boolean {
  if (/\bcan\s+i\b/.test(q)) return false;
  if (/\bleave\s+(balance|balances|summary|policy|types?|ledger)\b/.test(q)) return false;
  if (/\b(who|staff|employees?)\b.*\bon\s+leave\b/.test(q)) return false;
  if (/\bon\s+leave\b/.test(q) && !/\b(apply|request|create|open|raise|submit)\b/.test(q)) {
    return false;
  }
  if (/\b(approve|reject|cancel)\b.*\bleave\b/.test(q)) return false;
  return (
    /\b(apply|request|raise)\s+(?:for\s+)?(?:[\w-]+\s+){0,3}leave\b/.test(q) ||
    /\b(create|open|new|start|submit)\s+(?:a\s+)?leave\s+requests?\b/.test(q) ||
    (/\b(create|open|new|start|submit)\b/.test(q) && /\bleave\s+requests?\b/.test(q)) ||
    (/\b(apply|request|raise|create|open|submit)\b/.test(q) &&
      /\b(time\s+off|chutti|छुट्टी)\b/.test(q))
  );
}

function isRegularisationCreateCue(q: string): boolean {
  if (/\bcan\s+i\b/.test(q)) return false;
  if (/\b(approve|reject)\b.*\b(regularis|regulariz)/.test(q)) return false;
  if (/\b(pending|team)\s+(regularis|regulariz)/.test(q)) return false;
  return (
    (/\b(create|open|raise|request|submit|apply|file|start|new)\b/.test(q) &&
      /\b(regularis|regulariz)/.test(q)) ||
    (/\b(create|open|raise|request|submit|file|apply)\b/.test(q) &&
      /\b(missed\s+punch|forgot\s+to\s+punch)\b/.test(q))
  );
}

function extractIsoDateRange(q: string): { fromDate?: string; toDate?: string } {
  const range = q.match(
    /\bfrom\s+(\d{4}-\d{2}-\d{2})\s+(?:to|through|till|until)\s+(\d{4}-\d{2}-\d{2})\b/i
  );
  if (range?.[1] && range[2] && isIsoDate(range[1]) && isIsoDate(range[2])) {
    return { fromDate: range[1], toDate: range[2] };
  }
  const single =
    q.match(/\b(?:on|for|date)\s+(\d{4}-\d{2}-\d{2})\b/i) ??
    q.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (single?.[1] && isIsoDate(single[1])) {
    return { fromDate: single[1], toDate: single[1] };
  }
  return {};
}

function extractLeaveHalfDay(q: string): "NONE" | "FIRST_HALF" | "SECOND_HALF" | undefined {
  if (/\b(first\s+half|1st\s+half)\b/.test(q)) return "FIRST_HALF";
  if (/\b(second\s+half|2nd\s+half)\b/.test(q)) return "SECOND_HALF";
  if (/\bfull\s+day\b/.test(q)) return "NONE";
  return undefined;
}

function extractLeaveTypeHint(raw: string, q: string): string | undefined {
  const explicit = raw.match(
    /\bleave\s+type\s+([^,]{2,60}?)(?:\s+from|\s+to|\s+on|\s+reason|\s+for\b|$)/i
  );
  if (explicit?.[1]) {
    const hint = explicit[1].trim().slice(0, 60);
    if (hint.length >= 2) return hint;
  }
  const named = q.match(
    /\b(casual|sick|earned|privilege|annual|comp\s*off|compensatory|on\s+duty|od|wfh|work\s+from\s+home)\s+leave\b/i
  );
  if (named?.[1]) return named[1].replace(/\s+/g, " ").trim();
  const od = q.match(/\b(on\s+duty|work\s+from\s+home|wfh)\b/i);
  if (od?.[1] && /\bleave\b/.test(q)) return od[1].replace(/\s+/g, " ").trim();
  return undefined;
}

function extractReason(raw: string): string | undefined {
  const m = raw.match(/\breason\s*[:=]?\s+(.{3,200})$/i);
  return m?.[1]?.trim().slice(0, 200) || undefined;
}

function extractRegularisationType(q: string): string | undefined {
  if (/\bmissed\s+punch\s*-?\s*ins?\b/.test(q) || /\bforgot\s+(?:to\s+)?punch\s+in\b/.test(q)) {
    return "MISSED_PUNCH_IN";
  }
  if (/\bmissed\s+punch\s*-?\s*outs?\b/.test(q) || /\bforgot\s+(?:to\s+)?punch\s+out\b/.test(q)) {
    return "MISSED_PUNCH_OUT";
  }
  if (/\bmissed\s+punch\b/.test(q) || /\bforgot\s+(?:to\s+)?punch\b/.test(q)) {
    return "MISSED_PUNCH_IN";
  }
  if (/\blate\s+coming\b/.test(q) || /\bcame\s+late\b/.test(q)) return "LATE_COMING";
  if (/\bearly\s+going\b/.test(q) || /\bleft\s+early\b/.test(q)) return "EARLY_GOING";
  if (/\bout\s+of\s+location\b/.test(q)) return "OUT_OF_LOCATION";
  if (/\bwrong\s+punch\b/.test(q)) return "WRONG_PUNCH";
  if (/\bsite\s+duty\b/.test(q)) return "SITE_DUTY";
  if (/\bofficial\s+duty\b/.test(q)) return "OFFICIAL_DUTY";
  return undefined;
}

function matchLeave(raw: string, q: string): NovaSafeWorkflowMatch | null {
  if (!isLeaveCreateCue(q)) return null;
  const { fromDate, toDate } = extractIsoDateRange(q);
  return {
    formId: "leave_new",
    hrefBase: "/attendance-hr/leave",
    leaveTypeHint: extractLeaveTypeHint(raw, q),
    fromDate,
    toDate,
    halfDayType: extractLeaveHalfDay(q),
    reason: extractReason(raw),
  };
}

function matchRegularisation(raw: string, q: string): NovaSafeWorkflowMatch | null {
  if (!isRegularisationCreateCue(q)) return null;
  const { fromDate } = extractIsoDateRange(q);
  return {
    formId: "regularisation_new",
    hrefBase: "/attendance-hr/regularisation",
    requestType: extractRegularisationType(q),
    date: fromDate,
    reason: extractReason(raw),
  };
}

function extractVendorHint(q: string): string | undefined {
  let vendorHint = "";
  const vendorFor = q.match(
    /\bvendor\s+(.+?)\s+(?:for|of|amount)\s*(?:rs\.?|inr|₹)?\s*[\d,]/i
  );
  if (vendorFor?.[1]) {
    vendorHint = vendorFor[1].replace(/^(?:named|name|called)\s+/i, "").trim();
  }
  if (!vendorHint) {
    const payVendor = q.match(
      /\bpay\s+vendor\s+(.+?)\s+(?:for|of|amount|₹|rs\.?|inr)\b/i
    );
    if (payVendor?.[1]) vendorHint = payVendor[1].trim();
  }
  if (!vendorHint) {
    const vendorOnly = q.match(/\bvendor\s+(.+?)(?:\s+for|\s+project|\s+item|\s+material|$)/i);
    if (vendorOnly?.[1]) vendorHint = vendorOnly[1].trim();
  }
  vendorHint = vendorHint
    .replace(/\b(rupees?|inr|rs\.?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return vendorHint.length >= 2 ? vendorHint : undefined;
}

function extractItemHint(raw: string, q: string): string | undefined {
  const explicitItem = raw.match(
    /\bitem\s+(.+?)(?:\s+for|\s+vendor|\s+project|\s+amount|$)/i
  );
  if (explicitItem?.[1]) {
    const hint = explicitItem[1].trim().slice(0, 120);
    if (hint.length >= 2) return hint;
  }

  const material = raw.match(
    /\bmaterial\s+(.+?)(?:\s+for|\s+vendor|\s+project|\s+amount|$)/i
  );
  if (material?.[1]) {
    const hint = material[1].trim().slice(0, 120);
    if (hint.length >= 2) return hint;
  }

  const buy = q.match(
    /\bbuy\s+(?:material|materials|stock)\s+(.+?)(?:\s+for|\s+vendor|\s+project|$)/i
  );
  if (buy?.[1]) {
    const hint = buy[1].trim().slice(0, 120);
    if (hint.length >= 2) return hint;
  }

  return undefined;
}

function extractProjectHint(raw: string, q: string): string | undefined {
  const m =
    raw.match(/\bproject\s+(.+?)(?:\s+for|\s+vendor|\s+item|\s+material|\s+assign|\s+titled|$)/i) ??
    q.match(/\bproject\s+(.+?)(?:\s+for|\s+vendor|\s+item|\s+material|$)/i);
  if (!m?.[1]) return undefined;
  const hint = m[1].trim().slice(0, 80);
  return hint.length >= 2 ? hint : undefined;
}

function extractTaskTitle(raw: string): string | null {
  const patterns = [
    /\b(?:create|make|new|open|raise|start|assign)\s+(?:a\s+)?task\s+(?:titled|called|named)\s+["']?(.+?)["']?(?:\s+(?:for|assign|to|project)\b|$)/i,
    /\b(?:create|make|new|open|raise|start)\s+(?:a\s+)?task\s+(?:to\s+)?(?:assign(?:ed)?\s+(?:to\s+)?[\w\s]+?\s+)?(?:titled\s+)?["']?(.+?)["']?(?:\s+(?:for|assign|project)\b|$)/i,
    /\bassign\s+(?:a\s+)?task\s+(?:to\s+[\w\s]+?\s+)?(?:titled\s+|called\s+)?["']?(.+?)["']?(?:\s+(?:for|project)\b|$)/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const title = m[1]
        .trim()
        .replace(/^["']|["']$/g, "")
        .slice(0, 200);
      if (title.length >= 2) return title;
    }
  }
  return null;
}

function extractAssigneeHint(raw: string): string | undefined {
  const patterns = [
    /\bassign(?:ed)?\s+to\s+(.+?)(?:\s+titled|\s+called|\s+for\s+project|\s+project\b|$)/i,
    /\btask\s+for\s+(.+?)(?:\s+titled|\s+called|\s+project\b|$)/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const hint = m[1].trim().slice(0, 80);
      if (hint.length >= 2) return hint;
    }
  }
  return undefined;
}

function matchPurchaseRequest(raw: string, q: string): NovaSafeWorkflowMatch | null {
  if (!isPurchaseRequestCreateCue(q)) return null;
  const vendorHint = extractVendorHint(q);
  const itemHint = extractItemHint(raw, q);
  const projectHint = extractProjectHint(raw, q);
  const amount = parseOptionalAmount(q);
  if (!vendorHint && !itemHint && !projectHint && amount == null) return null;
  return {
    formId: "purchase_request_new",
    hrefBase: "/purchase-requests/new",
    vendorHint,
    itemHint,
    projectHint,
    amount,
    purpose: parsePurpose(q),
  };
}

function matchTask(raw: string, q: string): NovaSafeWorkflowMatch | null {
  if (!isTaskCreateCue(q)) return null;
  const title = extractTaskTitle(raw);
  if (!title) return null;
  return {
    formId: "task_new",
    hrefBase: "/tasks/new",
    title,
    assigneeHint: extractAssigneeHint(raw),
    projectHint: extractProjectHint(raw, q),
  };
}

function matchTaskEdit(raw: string, q: string): NovaSafeWorkflowMatch | null {
  if (!isTaskEditCue(q)) return null;
  const titleHint = extractTaskEditTitle(raw);
  // Bare “edit task” without a title is not clear enough — leave write-deny / help.
  if (!titleHint) return null;
  return {
    formId: "task_edit",
    hrefBase: "/tasks",
    titleHint,
  };
}

function matchStaffAdvance(q: string): NovaSafeWorkflowMatch | null {
  if (!isStaffAdvanceCreateCue(q)) return null;
  return {
    formId: "staff_advance",
    hrefBase: "/payment-requests/new",
    type: "STAFF_ADVANCE",
    amount: parseOptionalAmount(q),
    purpose: parsePurpose(q),
  };
}

function matchStaffReimbursement(q: string): NovaSafeWorkflowMatch | null {
  if (!isStaffReimbursementCreateCue(q)) return null;
  return {
    formId: "staff_reimbursement",
    hrefBase: "/payment-requests/new",
    type: "STAFF_EXPENSE_REIMBURSEMENT",
    amount: parseOptionalAmount(q),
    purpose: parsePurpose(q),
  };
}

function matchPaymentRequest(q: string): NovaSafeWorkflowMatch | null {
  if (!isPaymentRequestCreateCue(q)) return null;
  const amount = parseOptionalAmount(q);
  if (amount == null) return null;
  const vendorHint = extractVendorHint(q);
  if (!vendorHint) return null;
  return {
    formId: "payment_request_new",
    hrefBase: "/payment-requests/new",
    type: "VENDOR_PAYMENT",
    vendorHint,
    amount,
    purpose: parsePurpose(q),
  };
}

/**
 * Extract vendor hint + amount for payment-request open, plus P1 surfaces.
 * Priority: purchase → leave → regularisation → task edit → task create → advance → reimbursement → payment.
 */
export function matchNovaSafeWorkflowOpen(query: string): NovaSafeWorkflowMatch | null {
  const raw = query.trim();
  const q = coreQuery(raw);
  if (!q || q.length > 280) return null;
  if (isNovaSafeWorkflowHardWriteCue(q)) return null;
  if (isHowToFraming(q)) return null;

  return (
    matchPurchaseRequest(raw, q) ??
    matchLeave(raw, q) ??
    matchRegularisation(raw, q) ??
    matchTaskEdit(raw, q) ??
    matchTask(raw, q) ??
    matchStaffAdvance(q) ??
    matchStaffReimbursement(q) ??
    matchPaymentRequest(q)
  );
}

export function safeWorkflowFormPath(formId: NovaSafeWorkflowFormId): string {
  switch (formId) {
    case "purchase_request_new":
      return "/purchase-requests/new";
    case "task_new":
      return "/tasks/new";
    case "task_edit":
      return "/tasks";
    case "leave_new":
      return "/attendance-hr/leave";
    case "regularisation_new":
      return "/attendance-hr/regularisation";
    case "payment_request_new":
    case "staff_advance":
    case "staff_reimbursement":
      return "/payment-requests/new";
  }
}

export function formIdFromSafeWorkflowHrefPath(pathname: string): NovaSafeWorkflowFormId | null {
  const trimmed = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const path =
    trimmed.length > 1 && trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed || "/";
  if (path === "/purchase-requests/new") return "purchase_request_new";
  if (path === "/tasks/new") return "task_new";
  if (path === "/attendance-hr/leave") return "leave_new";
  if (path === "/attendance-hr/regularisation") return "regularisation_new";
  if (path === "/payment-requests/new") return "payment_request_new";
  return null;
}

/** Sync detector used by write-guards / aware carve-outs (no RBAC / resolve). */
export function isNovaSafeWorkflowOpenQuery(query: string): boolean {
  return matchNovaSafeWorkflowOpen(query) != null;
}
