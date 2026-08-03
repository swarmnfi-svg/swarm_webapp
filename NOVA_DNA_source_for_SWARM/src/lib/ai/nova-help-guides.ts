/**
 * RBAC-aware ERP how-to / guide answers for NOVA.
 *
 * Extends the Aware engine: instructional asks ("how to…", "guide me…", "can I…")
 * must not fall into entity-resolve or blunt write-deny. Steps are grounded in the
 * in-app user manual (`getNovaManualCorpus`: full + Compare & migrate) plus curated aliases.
 *
 * NOVA stays read-only — guides point users to ERP screens; they never claim chat can mutate.
 */
import type { SessionUser } from "@/auth";
import { canAccessPath } from "@/lib/route-access";
import {
  getNovaManualCorpus,
  type ManualRole,
  type ManualSection,
} from "@/lib/user-manual";

export type NovaHelpGuideAnswer = {
  answer: string;
  links: { title: string; href: string }[];
  toolsUsed: string[];
};

export type NovaHelpGuideDef = {
  id: string;
  /** Screen / workflow title shown to the user. */
  title: string;
  href: string;
  /** Manual section id for corpus grounding. */
  manualSectionId: string;
  /** Prefer these manual item action labels when present. */
  manualActions?: string[];
  /** Extra regexes (already lowercased query). */
  patterns: RegExp[];
  /** Keyword tokens (any strong hit). */
  keywords: string[];
  /** Fallback steps when manual item missing. */
  steps: string[];
  notes?: string[];
};

function coreQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[!?.,…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Explicit how-to / guide framing (EN + common Hinglish/Hindi). */
export function hasNovaInstructionalFraming(query: string): boolean {
  const q = coreQuery(query);
  if (!q) return false;
  return (
    /\b(how\s+to|how\s+do\s+i|how\s+can\s+i|how\s+do\s+we|guide\s+me|walk\s+me\s+through|show\s+me\s+how|tell\s+me\s+how|steps?\s+to|where\s+(do\s+i|to|can\s+i)|can\s+i\s+(do|enter|create|make|submit|request|punch|pay|record|add)|can\s+we\s+(do|enter|create|make|submit|pay))\b/.test(
      q
    ) ||
    /\b(kaise|कैसे|batao|bataao|bata\s+do|samjhao|sikhao)\b/.test(q) ||
    /\b(mujhe|muze)\s+(batao|bataao|samjhao|sikhao)\b/.test(q)
  );
}

/**
 * Live ERP data / status / presence pulls — must NOT steal into howto_guide.
 * Instructional framing always wins (returns false).
 * Permission/capability asks (“can manager see profit”) are not live data.
 */
export function isNovaLiveErpDataAsk(query: string): boolean {
  const q = coreQuery(query);
  if (!q || hasNovaInstructionalFraming(q)) return false;
  // Lazy import avoided — keep detector local-shape so permission asks never
  // get classified as who/which live pulls (e.g. “who can see profit”).
  if (
    /\bwho\s+can\s+(see|view|access|open|check|read)\b/.test(q) ||
    /\bwho\s+has\s+(access|permission|visibility)\b/.test(q) ||
    /\bcan\s+(\w+)\s+(see|view|access|open|check|read)\b/.test(q) ||
    /\bdoes\s+\w+\s+have\s+(access|permission|visibility|rights?)\b/.test(q) ||
    /\bcan\s+(i|we)\s+(see|view|access|open|check|read)\b/.test(q)
  ) {
    return false;
  }
  if (
    /\b(pending|awaiting|overdue|submitted|manager[_\s-]?verified|admin[_\s-]?approved)\b/.test(q)
  ) {
    return true;
  }
  if (
    /\b(today|yesterday|tomorrow|aaj|kal|this\s+(week|month|fy|year|quarter)|last\s+(week|month|year))\b/.test(
      q
    )
  ) {
    return true;
  }
  if (/\b(how\s+many|how\s+much)\b/.test(q)) return true;
  if (/\b(who|which)\b/.test(q)) return true;
  if (/\b(did|was|were)\s+\w+/.test(q)) return true;
  if (/\b(punch(?:ed|ing)?[\s-]*in|punch(?:ed|ing)?[\s-]*out|late\s+comers?|absent|present)\b/.test(q)) {
    return true;
  }
  if (/\b(times?)\b/.test(q) && /\b(punch|in|out|late)\b/.test(q)) return true;
  if (/\b(show|list|summary|status|report|trend|analysis|why)\b/.test(q)) return true;
  if (/\b(my|mine)\s+(tasks?|advances?|leave|attendance|expenses?|payments?)\b/.test(q)) {
    return true;
  }
  return false;
}

/** Instructional / how-to shape — not a live data pull. */
export function isNovaHowToGuideQuery(query: string): boolean {
  const q = coreQuery(query);
  if (!q || q.length > 280) return false;
  if (hasNovaInstructionalFraming(q)) return true;
  if (isNovaLiveErpDataAsk(q)) return false;
  if (
    /\b(part\s+payments?|partial\s+payments?|enter\s+(employee\s+)?salary|salary\s+entry|record\s+salary|create\s+(a\s+)?tasks?|submit\s+payment\s+request|regularis[ee]|request\s+(an?\s+)?advance)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (
    /\b(migrat(?:e|ing|ion)|switch(?:ing)?\s+from|coming\s+from|vs\.?\s+(tally|zoho)|compared?\s+to\s+(tally|zoho)|differen(?:ce|t)\s+from\s+(tally|zoho)|godown|tallyprime|zoho\s+books)\b/.test(
      q
    )
  ) {
    return true;
  }
  return false;
}

const GUIDES: NovaHelpGuideDef[] = [
  {
    id: "salary-enter",
    title: "Salary Entry / Salary Payments",
    href: "/accounts/salary",
    manualSectionId: "accounts-core",
    manualActions: ["Salary payment (draft)", "Approve & pay salary"],
    patterns: [
      /\b(enter|record|post|add|make)\b.*\b(employee\s+)?(salary|payroll|salry|salery)\b/,
      /\b(salary|salry|salery)\s+(entry|payment|payments|posting)\b/,
      /\bhow\s+to\b.*\b(salary|salry|salery)\b/,
    ],
    keywords: ["salary", "salry", "salery", "payroll", "enter salary", "salary entry"],
    steps: [
      "Open **Accounts → Salary Payments** (or search “Salary Payments”).",
      "Click **Record Salary Payment**.",
      "Select employee, salary month, amount, Bank/Cash → save as **DRAFT**.",
      "A **different** user must **Approve & pay** (maker-checker).",
    ],
    notes: [
      "Do **not** use Payment Requests or Manual Expenses for salary.",
      "Part payments: use **Record Salary Payment** again for the same employee + month for each part.",
      "Over expected monthly salary: amber warning only — submit/approve are not blocked.",
      "NOVA cannot create salary payments — use the ERP screen.",
    ],
  },
  {
    id: "salary-part-payment",
    title: "Part / partial salary payment",
    href: "/accounts/salary/new",
    manualSectionId: "accounts-core",
    manualActions: ["Salary payment (draft)", "Part / partial salary payment"],
    patterns: [
      /\b(part|partial)\s+payments?\b.*\b(salary|salry|salery|payroll)\b/,
      /\b(salary|salry|salery|payroll)\b.*\b(part|partial)\s+payments?\b/,
      /\bcan\s+i\s+.*\b(part|partial)\b.*\b(salary|salry|salery)\b/,
    ],
    keywords: ["part payment", "partial payment", "part pay", "salry", "salary"],
    steps: [
      "Yes — salary **can be paid in parts**.",
      "Open **Accounts → Salary Payments → Record Salary Payment** (or search “Salary Payments”).",
      "For each part: choose the **same employee + same salary month**, enter that part’s ₹ amount (optional notes e.g. “part pay”), save **DRAFT**, then a **different** user **Approve & pay**.",
      "Repeat **Record Salary Payment** for further parts of the same month — multiple entries for the same employee and month are allowed.",
    ],
    notes: [
      "Use Accounts → Salary Payments only — not Payment Requests or Manual Expenses.",
      "If month-to-date + this part would exceed the employee’s expected monthly salary (HR structure monthly gross), the form shows an amber warning — submit and approve are still allowed (warn only).",
      "NOVA is read-only — it cannot post the payment for you.",
    ],
  },
  {
    id: "tasks-create",
    title: "Create a task",
    href: "/tasks",
    manualSectionId: "tasks-notifications",
    manualActions: ["Create personal task", "Create project task", "Open Tasks"],
    patterns: [
      /\b(create|add|make|new)\b.*\b(tasks?|todos?)\b/,
      /\b(tasks?|todos?)\b.*\b(create|add|make|new)\b/,
      /\bguide\b.*\b(tasks?|todos?)\b/,
    ],
    keywords: ["create task", "create tasks", "new task", "add task", "guide task"],
    steps: [
      "Sidebar → **Tasks** (or search “Tasks”).",
      "Click **+ New task**.",
      "**Personal:** Type Personal → title, due date, priority → Assigned to → Create.",
      "**Project:** Type Project → select Project (or open Project → Project Tasks → + Add).",
    ],
    notes: ["NOVA cannot create or assign tasks from chat — use the Tasks screen."],
  },
  {
    id: "tasks-complete",
    title: "Complete / update a task",
    href: "/tasks",
    manualSectionId: "tasks-notifications",
    manualActions: ["Update status / complete", "Assign to staff"],
    patterns: [
      /\b(complete|finish|close|mark\s+done|update\s+status|assign)\b.*\b(tasks?|todos?)\b/,
      /\b(tasks?|todos?)\b.*\b(complete|finish|assign|status)\b/,
    ],
    keywords: ["complete task", "assign task", "task status"],
    steps: [
      "Open **Tasks** → open the task.",
      "Use status (TODO → In progress → … → Completed) or **Mark complete**.",
      "To reassign: **Assigned to** → search staff → tick people.",
    ],
  },
  {
    id: "payment-requests",
    title: "Payment Requests",
    href: "/payment-requests",
    manualSectionId: "payments",
    manualActions: [
      "Create payment request",
      "Manager verify",
      "Admin approve",
      "Mark paid",
    ],
    patterns: [
      /\b(create|submit|make|new)\b.*\bpayment\s+requests?\b/,
      /\bpayment\s+requests?\b.*\b(create|submit|approve|how)\b/,
      /\bhow\s+to\b.*\b(payment\s+request|pay\s+vendor|vendor\s+payment)\b/,
      /\b(kaise|कैसे)\b.*\bpayment\s+requests?\b/,
    ],
    keywords: ["submit payment", "approve payment", "create payment request", "how to payment"],
    steps: [
      "Sidebar → **Payment Requests** → **New**.",
      "Fill type, party, amount, purpose → **Save draft** or **Submit**.",
      "Flow: Submitted → Manager Verify → Admin Approve → **Mark Paid** (ledger).",
    ],
    notes: [
      "Staff usually see **their own** requests unless granted `paymentrequest.view_all`.",
      "Creator cannot verify/approve their own request (SoD).",
      "NOVA can open this form with suggested fields when you name a vendor and amount; you always Save / Submit yourself.",
    ],
  },
  {
    id: "attendance-punch",
    title: "Attendance punch",
    href: "/attendance-hr",
    manualSectionId: "attendance-hr",
    manualActions: ["Punch in / out", "My Attendance"],
    patterns: [
      /\bhow\s+to\b.*\b(punch|attendance|clock\s+in)\b/,
      /\b(guide|steps?|where)\b.*\b(punch|clock\s+in)\b/,
      /\b(kaise|कैसे)\b.*\b(punch|attendance|clock)\b/,
      /\bcan\s+i\s+(punch|clock)\b/,
      /\b(mark|record)\b.*\battendance\b/,
    ],
    keywords: ["how to punch", "attendance punch", "clock in", "mark attendance"],
    steps: [
      "Open **Attendance & HR** → **My Attendance** (or punch from the HR home).",
      "Use selfie / geo punch as configured for your site.",
      "Managers review register / exception queue for approvals.",
    ],
  },
  {
    id: "attendance-regularise",
    title: "Attendance regularisation",
    href: "/attendance-hr",
    manualSectionId: "attendance-hr",
    manualActions: ["Regularisation", "Exception queue"],
    patterns: [
      /\b(regularis|regulariz|missed\s+punch|forgot\s+to\s+punch)\b/,
      /\bhow\s+to\b.*\b(regularis|regulariz|exception)\b/,
    ],
    keywords: ["regularise", "regularize", "missed punch", "exception queue"],
    steps: [
      "Attendance & HR → request **regularisation** for the date (or ask your manager).",
      "Managers/Admin use **Exception queue** to clear missing punch / pending approvals.",
    ],
    notes: [
      "NOVA can open the regularisation form with suggested type/date; you always submit yourself.",
    ],
  },
  {
    id: "attendance-register",
    title: "Attendance register / muster roll",
    href: "/attendance-hr/roll",
    manualSectionId: "attendance-hr",
    manualActions: ["Monthly muster roll", "View register"],
    patterns: [
      /\b(muster|register|roll)\b.*\battendance\b/,
      /\battendance\b.*\b(register|roll|muster|view)\b/,
      /\bhow\s+to\b.*\b(attendance\s+register|muster)\b/,
    ],
    keywords: ["attendance register", "muster roll", "monthly roll"],
    steps: [
      "Attendance & HR → **Monthly attendance roll** (`/attendance-hr/roll`).",
      "Filter month/department/site → Print or Export CSV when permitted.",
    ],
  },
  {
    id: "staff-advances",
    title: "Staff advances / expenses",
    href: "/my-advances",
    manualSectionId: "staff-self-service",
    manualActions: ["Request staff advance", "Settle advance"],
    patterns: [
      /\b(request|apply|take)\b.*\b(advance|advances|staff\s+advance)\b/,
      /\bhow\s+to\b.*\b(advance|expense\s+claim|reimburs)\b/,
      /\b(kaise|कैसे)\b.*\b(advance|advances)\b/,
    ],
    keywords: ["request advance", "how to advance", "expense claim", "staff advance request"],
    steps: [
      "Staff: **My Advances → New Advance** → amount, purpose, project → Submit.",
      "Approval continues via **Payment Requests** / Approvals.",
      "Settle: open advance → upload bills → Submit for accounts verification.",
    ],
  },
  {
    id: "projects",
    title: "Projects",
    href: "/projects",
    manualSectionId: "customers-projects",
    manualActions: ["Create / edit project", "View customers / projects", "Budget & estimated margin"],
    patterns: [
      /\bhow\s+to\b.*\bprojects?\b/,
      /\b(create|add|new)\b.*\bprojects?\b/,
      /\bguide\b.*\bprojects?\b/,
      /\bhow\s+(do\s+i|to)\s+(ask|see|check)\b.*\b(new\s+orders?|confirmed\s+(orders?|projects?)|orders?\s+confirmed)\b/,
      /\bwhat\s+(are|is)\b.*\b(new\s+orders?|confirmed\s+projects?)\b/,
    ],
    keywords: [
      "create project",
      "how to project",
      "new project",
      "new orders this month",
      "projects confirmed",
      "confirmed projects value received",
    ],
    steps: [
      "Sidebar → **Projects**.",
      "Manager/Admin: **New Project** → link customer, budget, dates. Confirm status sets the CONFIRMED date used for order book / “new orders”.",
      "Ask NOVA: **new orders this month** or **projects confirmed this month** for count + value / received / outstanding (not Sales Orders).",
      "For Sales Order documents specifically, ask **sales orders this month** or **open sales orders**.",
      "Open a project for checklist, Project Tasks, and (when permitted) Est. Margin / profitability.",
    ],
  },
  {
    id: "sales-orders",
    title: "Sales Orders",
    href: "/sales-orders",
    manualSectionId: "sales-billing",
    manualActions: ["View sales orders", "Create sales order"],
    patterns: [
      /\bhow\s+to\b.*\bsales\s+orders?\b/,
      /\b(create|add|new)\b.*\bsales\s+orders?\b/,
    ],
    keywords: ["create sales order", "how to sales order", "new sales order"],
    steps: [
      "Sidebar → **Sales Orders** (or search “Sales Orders”).",
      "Manager+: **New** → customer, project, line items → Save.",
      "Ask NOVA **sales orders this month** or **open sales orders** for the SO document queue (distinct from project “new orders”).",
    ],
  },
  {
    id: "receipts",
    title: "Receipts / collections",
    href: "/receipts",
    manualSectionId: "sales-billing",
    manualActions: ["Record customer receipt", "Approve & post receipt"],
    patterns: [
      /\bhow\s+to\b.*\b(receipts?|collections?)\b/,
      /\b(record|create|enter)\b.*\b(receipts?|collections?)\b/,
    ],
    keywords: ["record receipt", "create receipt", "how to receipt"],
    steps: [
      "Sidebar → **Receipts → New** → customer, amount, mode → Save (**PENDING POST**).",
      "A different user **Approve & post** to ledger (SoD).",
    ],
  },
  {
    id: "billing",
    title: "Billing / tax invoices",
    href: "/billing",
    manualSectionId: "sales-billing",
    manualActions: ["Create tax invoice", "Print or download PDF"],
    patterns: [
      /\bhow\s+to\b.*\b(invoice|billing|tax\s+invoice)\b/,
      /\b(create|raise|generate)\b.*\b(invoice|billing)\b/,
    ],
    keywords: ["create invoice", "how to billing", "tax invoice"],
    steps: [
      "Sidebar → **Billing → New Invoice** → from sales order or manual lines → Post.",
      "Use Preview / Print / Download PDF on the invoice.",
    ],
    notes: [
      "NOVA is read-only — it cannot create or post invoices from chat.",
      "NOVA Reader can prefill invoice drafts from a photo/PDF — verify before saving.",
    ],
  },
  {
    id: "leave-request",
    title: "Leave request",
    href: "/attendance-hr/leave",
    manualSectionId: "attendance-hr",
    manualActions: ["Apply leave"],
    patterns: [
      /\bhow\s+to\b.*\b(leave|holiday|time\s+off)\b/,
      /\b(apply|request|raise)\b.*\b(leave|holiday|time\s+off)\b/,
      /\b(kaise|कैसे)\b.*\b(leave|chutti|छुट्टी)\b/,
      /\bcan\s+i\s+(apply|request)\s+leave\b/,
    ],
    keywords: ["apply leave", "request leave", "how to leave", "leave application"],
    steps: [
      "Open **Attendance & HR → Leave** (or search “Leave”).",
      "Choose leave type + dates → Submit for approval.",
      "Managers approve from the leave / Approvals queue.",
    ],
    notes: ["NOVA can open the leave form with suggested type/dates; it cannot submit leave for you."],
  },
  {
    id: "purchase-bills",
    title: "Purchase bills",
    href: "/purchase-bills",
    manualSectionId: "purchases",
    manualActions: ["Enter purchase bill"],
    patterns: [
      /\bhow\s+to\b.*\b(purchase\s+bills?|vendor\s+bills?)\b/,
      /\b(create|enter|record)\b.*\b(purchase\s+bills?|vendor\s+bills?)\b/,
      /\b(kaise|कैसे)\b.*\b(purchase\s+bill|vendor\s+bill)\b/,
    ],
    keywords: ["create purchase bill", "how to purchase bill", "enter vendor bill"],
    steps: [
      "Sidebar → **Purchase Bills → New** (or from a PO).",
      "Enter vendor, lines, GST → Save draft → Manager verify when required.",
      "Optional: use **NOVA Reader** to prefill from a bill photo/PDF, then verify fields.",
    ],
    notes: ["NOVA is read-only — it cannot post purchase bills from chat."],
  },
  {
    id: "migrate-compare",
    title: "Compare & migrate (Tally / Zoho / other)",
    href: "/user-manual",
    manualSectionId: "compare-overview",
    manualActions: [
      "Who should read this",
      "Keep both books during cutover (optional)",
      "Open native modules vs Tally snapshots",
    ],
    patterns: [
      /\b(migrat(?:e|ing|ion)|switch(?:ing)?\s+from|coming\s+from)\b.*\b(tally|zoho|busy|marg|quickbooks)\b/,
      /\b(tally|zoho|busy|marg|quickbooks)\b.*\b(migrat(?:e|ing|ion)|to\s+empower|vs\.?\s+empower)\b/,
      /\bcompare\s+(and\s+)?migrat/,
      /\b(user\s+manual|manual)\b.*\b(migrat|tally|zoho)\b/,
    ],
    keywords: [
      "compare and migrate",
      "migrate from books",
      "coming from accounting software",
      "switch from other erp",
    ],
    steps: [
      "Open **User Manual → Compare & migrate** tab.",
      "Start with **Concept map**, then **Migrating from TallyPrime** or **Zoho Books / Finance**.",
      "Use **Honest gaps** so you do not double-post Payment Requests as Manual Expenses.",
    ],
    notes: [
      "Tally Connector syncs snapshots; it does not auto-post native ledgers unless you import a draft.",
      "There is no Zoho/Busy/Marg/QuickBooks connector — cutover is manual with your accountant.",
    ],
  },
  {
    id: "migrate-concepts",
    title: "Concept map vs Tally / Zoho",
    href: "/user-manual",
    manualSectionId: "compare-concepts",
    manualActions: [
      "Ledger / Chart of Accounts",
      "Voucher (Payment / Receipt / Journal / Contra)",
      "Godown / warehouse",
      "GST / tax",
      "AI assistant",
    ],
    patterns: [
      /\b(where\s+is|what\s+is|how\s+is)\b.*\b(ledger|godown|voucher|gst)\b.*\b(tally|zoho|empower)\b/,
      /\b(ledger|godown|voucher|gst)\b.*\b(vs\.?|versus|compared?\s+to|different\s+from|in\s+empower)\b.*\b(tally|zoho)?/,
      /\b(tally|zoho)\b.*\b(ledger|godown|voucher|gst)\b.*\b(empower|where|vs)\b/,
      /\bgodown\b.*\b(empower|stock|where)\b/,
      /\bhow\s+is\s+gst\s+different\s+from\s+tally\b/,
      /\bwhere\s+is\s+ledger\b.*\b(zoho|tally|empower)\b/,
    ],
    keywords: [
      "ledger vs zoho",
      "ledger in empower vs zoho",
      "godown in empower",
      "gst different from tally",
      "voucher vs tally",
      "chart of accounts vs tally",
    ],
    steps: [
      "User Manual → **Compare & migrate → Concept map**.",
      "Ledger/COA → Accounts → Chart of Accounts; Godown → Stock Locations + Stock; Vouchers → Journal or Billing/Bills/Receipts/Payment Requests.",
      "Optional Tally/Zoho equivalent labels on chart accounts are display helpers only.",
    ],
  },
  {
    id: "migrate-tally",
    title: "Migrating from TallyPrime",
    href: "/tally",
    manualSectionId: "compare-tally",
    manualActions: [
      "Where Gateway of Tally habits go",
      "What the Tally Connector syncs",
      "What does NOT auto-post from Tally",
      "GST vs Tally",
    ],
    patterns: [
      /\b(migrat(?:e|ing|ion)|switch(?:ing)?|coming)\b.*\btally(prime)?\b/,
      /\btally(prime)?\b.*\b(migrat|connector|sync|vs\.?\s+empower|different)\b/,
      /\b(tally\s+connector|sync\s+from\s+tally|write-?back\s+to\s+tally)\b/,
    ],
    keywords: [
      "migrating from tally",
      "tally connector",
      "tally sync",
      "tallyprime",
      "gst vs tally",
      "how is gst different from tally",
    ],
    steps: [
      "Native day-to-day work lives in emPOWER menus (Payment Requests, Bills, Receipts, Attendance) — not only Tally vouchers.",
      "Admin/Accountant: **Tally → Connection Setup** + local connector; Sync pulls ledger/group/stock/voucher **snapshots**.",
      "Snapshots do not auto-post unless explicitly imported as draft; write-back needs approval + write-back enabled.",
    ],
    notes: [
      "Never expose Tally port 9000 to the internet; connector token stays in .env.",
      "Full connector steps: User Manual → Tally Connector (Full manual) and Compare & migrate → Migrating from TallyPrime.",
    ],
  },
  {
    id: "migrate-zoho",
    title: "Migrating from Zoho Books / Finance",
    href: "/user-manual",
    manualSectionId: "compare-zoho",
    manualActions: [
      "Module map (Zoho → emPOWER)",
      "What feels different from Zoho",
      "Other products (Busy / Marg / QuickBooks)",
    ],
    patterns: [
      /\b(migrat(?:e|ing|ion)|switch(?:ing)?|coming)\b.*\bzoho\b/,
      /\bzoho\s*(books|finance|inventory|people)?\b.*\b(migrat|vs\.?\s+empower|empower|module)\b/,
      /\b(busy|marg|quickbooks)\b.*\b(migrat|vs\.?\s+empower|empower)\b/,
    ],
    keywords: [
      "migrating from zoho",
      "zoho books",
      "zoho vs empower",
      "busy marg quickbooks",
      "where is ledger in empower vs zoho",
    ],
    steps: [
      "User Manual → **Compare & migrate → Migrating from Zoho**.",
      "Invoices→Billing, Bills→Purchase Bills, Payments→Receipts, COA→Chart of Accounts, People→Attendance & HR, Projects→Projects.",
      "No Zoho connector — plan opening balances with your accountant; maker-checker and Payment Requests are stricter than many Zoho flows.",
    ],
  },
];

function scoreGuide(q: string, g: NovaHelpGuideDef): number {
  let score = 0;
  for (const re of g.patterns) {
    if (re.test(q)) score += 12;
  }
  for (const kw of g.keywords) {
    if (q.includes(kw.toLowerCase())) score += kw.split(/\s+/).length >= 2 ? 6 : 3;
  }
  // Prefer more specific guides when both salary-enter and part-payment match
  if (g.id === "salary-part-payment" && /\b(part|partial)\b/.test(q)) score += 8;
  if (g.id === "tasks-create" && /\b(create|add|new|guide)\b/.test(q)) score += 4;
  if (g.id === "migrate-tally" && /\btally(prime)?\b/.test(q) && !/\bzoho\b/.test(q)) score += 10;
  if (g.id === "migrate-zoho" && /\bzoho\b/.test(q) && !/\btally\b/.test(q)) score += 10;
  if (g.id === "migrate-concepts" && /\b(ledger|godown|voucher|gst|chart\s+of\s+accounts)\b/.test(q)) {
    score += 8;
  }
  if (g.id === "migrate-compare" && /\b(compare\s+(and\s+)?migrat|user\s+manual)\b/.test(q)) {
    score += 4;
  }
  return score;
}

function manualSection(id: string): ManualSection | undefined {
  return getNovaManualCorpus().find((s) => s.id === id);
}

function stepsFromManual(g: NovaHelpGuideDef, role: ManualRole): string[] {
  const section = manualSection(g.manualSectionId);
  if (!section) return g.steps;
  const wanted = new Set((g.manualActions ?? []).map((a) => a.toLowerCase()));
  const fromManual = section.items
    .filter((item) => {
      if (wanted.size && !wanted.has(item.action.toLowerCase())) return false;
      if (!item.who.includes(role) && role !== "SUPER_ADMIN" && role !== "ADMIN") {
        // Still show if any overlap with common roles — filter later for display notes
        return item.who.length > 0;
      }
      return true;
    })
    .filter((item) => !wanted.size || wanted.has(item.action.toLowerCase()))
    .map((item) => `**${item.action}:** ${item.steps ?? ""}`.trim())
    .filter(Boolean);
  return fromManual.length > 0 ? fromManual.slice(0, 5) : g.steps;
}

function userCanOpen(user: SessionUser, href: string): boolean {
  try {
    return canAccessPath(user, href);
  } catch {
    return false;
  }
}

function filterStepsForRole(steps: string[], role: ManualRole, g: NovaHelpGuideDef): string[] {
  const section = manualSection(g.manualSectionId);
  if (!section) return steps;
  // If role is not in section.roles, keep general steps + permission note
  if (!section.roles.includes(role) && role !== "SUPER_ADMIN") {
    return steps;
  }
  return steps;
}

/** Best matching guide def (no RBAC yet). Live data asks never match. */
export function matchNovaHelpGuideDef(query: string): NovaHelpGuideDef | null {
  const q = coreQuery(query);
  if (!q) return null;
  if (isNovaLiveErpDataAsk(q)) return null;
  let best: NovaHelpGuideDef | null = null;
  let bestScore = 0;
  for (const g of GUIDES) {
    const s = scoreGuide(q, g);
    if (s > bestScore) {
      bestScore = s;
      best = g;
    }
  }
  const instructional = hasNovaInstructionalFraming(q) || isNovaHowToGuideQuery(q);
  const threshold = instructional ? 6 : 12;
  return bestScore >= threshold ? best : null;
}

/**
 * Keyword fallback across full + compare manual corpus when no curated guide hits.
 */
export function matchManualHelpFallback(
  query: string,
  role: ManualRole
): { title: string; href: string; steps: string[]; sectionId: string } | null {
  const q = coreQuery(query);
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return null;

  let best: {
    title: string;
    href: string;
    steps: string[];
    sectionId: string;
    score: number;
  } | null = null;

  for (const section of getNovaManualCorpus()) {
    if (!section.roles.includes(role) && role !== "SUPER_ADMIN" && role !== "ADMIN") {
      continue;
    }
    const blob = `${section.title} ${section.intro ?? ""} ${section.items
      .map((i) => `${i.action} ${i.steps ?? ""}`)
      .join(" ")}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (blob.includes(t)) score += 1;
    }
    if (score < 2) continue;
    const items = section.items
      .filter((i) => i.who.includes(role) || role === "ADMIN" || role === "SUPER_ADMIN")
      .slice(0, 4)
      .map((i) => `**${i.action}:** ${i.steps ?? ""}`);
    if (items.length === 0) continue;
    const candidate = {
      title: section.title,
      href: section.path ?? "/user-manual",
      steps: items,
      sectionId: section.id,
      score,
    };
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

export function answerNovaHelpGuide(
  user: SessionUser,
  query: string
): NovaHelpGuideAnswer | null {
  if (!isNovaHowToGuideQuery(query) && !matchNovaHelpGuideDef(query)) {
    // Still allow strong catalog hits without how-to prefix (e.g. "part payment of salry")
    const strong = matchNovaHelpGuideDef(query);
    if (!strong) return null;
  }

  const role = user.role as ManualRole;
  const def = matchNovaHelpGuideDef(query);

  if (def) {
    const canOpen = userCanOpen(user, def.href);
    const steps = filterStepsForRole(stepsFromManual(def, role), role, def);
    const lines: string[] = [
      `Here’s how to use **${def.title}** in emPOWER:`,
      "",
    ];
    if (canOpen) {
      lines.push(
        `**Where:** open **${def.title}** from the sidebar, or use top search for “${def.title.split("/")[0].trim()}”.`,
        `**Path:** \`${def.href}\``,
        ""
      );
    } else {
      lines.push(
        `This workflow lives at **${def.title}** (\`${def.href}\`), but **your role may not have access**. Ask an admin for the module permission if you need it.`,
        ""
      );
    }
    lines.push("**Steps:**");
    for (const s of steps) {
      lines.push(`• ${s}`);
    }
    if (def.notes?.length) {
      lines.push("", "**Notes:**");
      for (const n of def.notes) lines.push(`• ${n}`);
    }
    lines.push(
      "",
      "I can’t create or change records from chat (read-only). Use the ERP screen above — or open the **User Manual** for the full module guide."
    );
    const links: { title: string; href: string }[] = [];
    if (canOpen) links.push({ title: def.title, href: def.href });
    links.push({ title: "User Manual", href: "/user-manual" });
    return {
      answer: lines.join("\n"),
      links,
      toolsUsed: ["nova_aware", "howto_guide", `guide:${def.id}`, "user_manual"],
    };
  }

  if (!isNovaHowToGuideQuery(query)) return null;

  const fallback = matchManualHelpFallback(query, role);
  if (fallback) {
    const canOpen = userCanOpen(user, fallback.href);
    const lines = [
      `From the **User Manual** — **${fallback.title}**:`,
      "",
      ...fallback.steps.map((s) => `• ${s}`),
      "",
      "Permissions may apply for your role. NOVA is read-only for mutations — use the ERP screens.",
    ];
    return {
      answer: lines.join("\n"),
      links: [
        ...(canOpen ? [{ title: fallback.title, href: fallback.href }] : []),
        { title: "User Manual", href: "/user-manual" },
      ],
      toolsUsed: [
        "nova_aware",
        "howto_guide",
        `manual:${fallback.sectionId}`,
        "user_manual",
      ],
    };
  }

  // Generic instructional fallback — never bare write-deny
  return {
    answer: [
      "I can help with **how-to / navigation** for emPOWER modules (salary, tasks, payment requests, attendance, projects, billing, and more).",
      "",
      "Try asking more specifically, e.g. “how to enter employee salary”, “how to create tasks”, or “how to submit a payment request”.",
      "",
      "Or open the **User Manual** in the sidebar for role-based steps. I don’t create or edit records from chat.",
    ].join("\n"),
    links: [
      { title: "User Manual", href: "/user-manual" },
      { title: "NOVA", href: "/ai-assistant" },
    ],
    toolsUsed: ["nova_aware", "howto_guide", "user_manual"],
  };
}

/** Exported catalog size for tests / docs. */
export function listNovaHelpGuideIds(): string[] {
  return GUIDES.map((g) => g.id);
}
