/**
 * Shared NOVA module lexicon — synonyms → canonical topics → tools.
 * Topic RBAC permissions are derived from tools via `nova-tool-permissions` (NI-01).
 */
import type { Permission } from "@/lib/rbac";
import { novaPermissionsForTools } from "@/lib/ai/nova-tool-permissions";
import {
  looksLikeHardPartyOrProjectName,
  looksLikePartyOrProjectName,
} from "@/lib/nova/party-name";
import {
  parseNovaEntityRoleSpan,
  parseEntityModuleAsk,
  isNovaTemporalOrModuleEntityNoise,
} from "@/lib/nova/query-structure";

export type NovaTopicId =
  | "receipts"
  | "sales_invoices"
  | "receivables"
  | "collection_delay_estimate"
  | "payables"
  | "purchase_requests"
  | "purchase_orders"
  | "sales_orders"
  | "projects"
  | "customers"
  | "vendors"
  | "bank_accounts"
  | "bank_recon"
  | "stock"
  | "delivery"
  | "tasks"
  | "kpi"
  | "kpi_report"
  | "attendance"
  | "leave"
  | "overtime"
  | "regularisation"
  | "staff_advances"
  | "payment_requests"
  | "approvals"
  | "staff_expenses"
  | "incentives"
  | "cbg_quotations"
  | "my_work"
  | "daily_brief"
  | "proactive_insights"
  | "nova_analysis"
  | "nova_trend"
  | "collection_attention"
  | "month_performance"
  | "project_command"
  | "attendance_month"
  | "cash_banking"
  | "staff"
  | "pending_workflow"
  | "salary"
  | "accounts_ledger"
  | "tally"
  | "grn"
  | "credit_notes"
  | "order_book"
  | "gst_docs"
  | "vendor_bank"
  | "profitability"
  | "finance_dashboard"
  | "reports"
  | "customer_outstanding"
  | "documents"
  | "documents_search"
  | "nova_pulse"
  | "settings"
  | "appearance"
  | "notifications"
  | "whatsapp"
  | "portal"
  | "automation"
  | "links"
  | "bank_sms"
  | "system_backup"
  | "system_tools"
  | "audit_log";

export type NovaLexiconTopic = {
  id: NovaTopicId;
  /** Human label for deny messages */
  label: string;
  /** Phrases/words that map to this topic (matched as whole words / short phrases) */
  synonyms: string[];
  /** Tools to run when this topic matches (empty = not yet tooled) */
  tools: string[];
  /** Permission required (anyOf if multiple) */
  permissions: Permission[];
  /** Confidential: hard-deny when permission missing */
  confidential?: boolean;
  /** Treat as money metric for bare-word period clarification */
  moneyWord?: boolean;
  /** Deep-link when tool missing but topic understood */
  href?: string;
  /** Topics that collide with bare acronyms */
  ambiguousWith?: NovaTopicId[];
  /** Attendance focus tokens that bind to this topic */
  focusHints?: Array<"late" | "absent" | "present" | "overview" | "punch_out">;
  /** Slots this topic typically binds with (intent composer) */
  bindsWith?: Array<"period" | "status" | "person">;
  /** Query shapes that must not map to this topic */
  conflictsWith?: RegExp[];
  /** Topic alone is underspecified — ask clarifyPrompt */
  ambiguousAlone?: boolean;
  clarifyPrompt?: string;
};

/** Phrase replacements applied after typo fixes (longer phrases first). */
const PHRASE_EXPAND: [RegExp, string][] = [
  // Phase G — protect before collections→receipts token expand
  [/\bcollections?\s+delay(?:\s+estimate)?\b/gi, "collection_delay_estimate"],
  [/\bcollection_delay_estimate\b/gi, "collection_delay_estimate"],
  [/\bpayment\s+delay\s+(?:estimate|prediction)\b/gi, "collection_delay_estimate"],
  [/\bcollection\s+prediction\b/gi, "collection_delay_estimate"],
  [/\bwhen\s+will\s+they\s+pay\b/gi, "collection_delay_estimate"],
  [/\ba\s*\/\s*r\b/gi, "receivables"],
  [/\bpayments?\s+receivables?\b/gi, "receivables"],
  [/\breceivables?\s+from\s+clients?\b/gi, "customer outstanding"],
  [/\bclients?\s+pending\s+(?:payments?|amount)\b/gi, "customer outstanding"],
  [/\bcustomers?\s+pending\s+(?:payments?|amount)\b/gi, "customer outstanding"],
  [/\bpending\s+payments?\s+from\s+(?:clients?|customers?)\b/gi, "customer outstanding"],
  [/\bpayments?\s+pending\s+from\s+(?:clients?|customers?)\b/gi, "customer outstanding"],
  // Whole-phrase A/P + outstanding/baki before bare a/p→payables leaves
  // "payables outstanding" → TOKEN outstanding→receivables dual-route.
  [/\ba\s*\/\s*p\s+(?:outstanding|os|baki|baaki)\b/gi, "payables"],
  [/\bpayables?\s+(?:outstanding|os|baki|baaki)\b/gi, "payables"],
  [/\ba\s*\/\s*p\b/gi, "payables"],
  [/\bgst\s+(bill|invoice|invoices)\b/gi, "sales invoices"],
  [/\btax\s+invoices?\b/gi, "sales invoices"],
  [/\bmoney\s+in\b/gi, "receipts"],
  [/\bmoney\s+out\b/gi, "payables"],
  [/\border\s+book\b/gi, "order book"],
  [/\border\s+book\s+target\b/gi, "order book target"],
  [/\bfy\s+target\b/gi, "order book target"],
  [/\btarget\s+fy\b/gi, "order book target fy"],
  [/\btarget\s+(\d{2}\s*[-–/]\s*\d{2})\b/gi, "order book target $1"],
  [/\btarget\s+order\s+book\b/gi, "order book target"],
  [/\bdirector\s+dashboard\b/gi, "director dashboard"],
  [/\bcommand\s+center\b/gi, "director dashboard"],
  [/\bmaterial\s+receipts?\b/gi, "grn"],
  [/\bgoods\s+receipts?\b/gi, "grn"],
  [/\bvendor\s+bank\b/gi, "vendor bank"],
  [/\bbank\s+details\b/gi, "vendor bank"],
  [/\bbank\s+sms\b/gi, "bank sms"],
  [/\bsystem\s+backup\b/gi, "system backup"],
  [/\bsystem\s+tools\b/gi, "system tools"],
  [/\baudit\s+logs?\b/gi, "audit log"],
  [/\bfund\s+position\b/gi, "profitability"],
  [/\bbonus\s+payouts?\b/gi, "incentives"],
  [/\bstaff\s+directory\b/gi, "staff list"],
  [/\bstaff\s+list\b/gi, "staff list"],
  [/\bwho\s+is\s+most\s+late\b/gi, "late comers"],
  [/\bmost\s+late\b/gi, "late comers"],
  [/\bwho\s+was\s+late\b/gi, "late comers"],
  [/\bwho\s+is\s+late\b/gi, "late comers"],
  [/\bwho\s+came\s+late\b/gi, "late comers"],
  [/\bwho\s+punched\s+(?:in\s+)?late\b/gi, "late comers"],
  [/\bwho\s+punched\s+late\b/gi, "late comers"],
  [/\bpunched\s+(?:in\s+)?late\b/gi, "late comers"],
  [/\bwhose\s+late\b/gi, "late comers"],
  [/\b(kisne|kiska|kisko)\s+late\b/gi, "late comers"],
  [/\bcame\s+late\b/gi, "late comers"],
  [/\blate\s*comers?\b/gi, "late comers"],
  [/\bder\s+se\b/gi, "late comers"],
  [/\blate\s+aaya\b/gi, "late comers"],
  [/\blate\s+aaye\b/gi, "late comers"],
  // Keep a multi-word cue (like "late comers") so bare WH-absent/present
  // does not collapse to R3 period-clarify after expand.
  [/\bwho\s+was\s+absent\b/gi, "absent list"],
  [/\bwho\s+is\s+absent\b/gi, "absent list"],
  [/\bwho\s+were\s+absent\b/gi, "absent list"],
  [/\bwho\s+didn'?t\s+(?:come|punch(?:\s+in)?)\b/gi, "absent list"],
  [/\bwho\s+did\s+not\s+(?:come|punch(?:\s+in)?)\b/gi, "absent list"],
  [/\bwho\s+hasn'?t\s+punch(?:ed)?(?:\s+in)?\b/gi, "absent list"],
  [/\bwho\s+haven'?t\s+punch(?:ed)?(?:\s+in)?\b/gi, "absent list"],
  [/\bmissing\s+punch(?:\s*in)?\b/gi, "absent list"],
  [/\bno\s+shows?\b/gi, "absent list"],
  [/\babsentee\s+list\b/gi, "absent list"],
  [/\bwho\s+was\s+present\b/gi, "present list"],
  [/\bwho\s+is\s+present\b/gi, "present list"],
  [/\bpresent\s+list\b/gi, "present list"],
  [/\bgoods\s+received\s+notes?\b/gi, "grn"],
  [/\bmaterial\s+inward\b/gi, "grn"],
  [/\bgoods\s+inward\b/gi, "grn"],
  [/\bprofit\s*(?:and|&)\s*loss\b/gi, "fund position"],
  [/\bproject\s+profit\s*\/\s*loss\b/gi, "project profit loss"],
  [/\bprojects?\s+(?:on|in|at)\s+loss\b/gi, "project loss"],
  [/\bloss[-\s]*making\s+projects?\b/gi, "project loss"],
  [/\bp\s*&\s*l\b/gi, "fund position"],
  [/\bpnl\b/gi, "fund position"],
  [/\bsalary\s+slips?\b/gi, "salary"],
  [/\bwage\s+slips?\b/gi, "salary"],
  [/\bnet\s+pay\b/gi, "salary"],
  [/\bout\s+of\s+stock\b/gi, "low stock"],
  [/\bstock\s+shortage\b/gi, "low stock"],
  [/\breorder\s+level\b/gi, "low stock"],
  [/\bapproval\s+queue\b/gi, "approvals"],
  [/\bpending\s+approvals?\b/gi, "approvals"],
  [/\bwaiting\s+approvals?\b/gi, "approvals"],
  [/\bstaff\s+advance\s+pending\s+approval\b/gi, "staff advance pending approval"],
  [/\bstaff\s+advance\s+pending\s+settlement\b/gi, "staff advance pending settlement"],
  [/\bpending\s+settlement\s+advances?\b/gi, "staff advance pending settlement"],
  [/\bstaff\s+reimbursements?\b/gi, "staff reimbursement"],
  [/\breimbursements?\s+(?:requested|claimed)\s+by\s+staff\b/gi, "staff reimbursement"],
  [/\bwho\s+claimed\s+most\s+reimbursements?\b/gi, "top reimbursement claimants"],
  [/\bwhich\s+staff\s+spends?\s+more\s+money\b/gi, "staff spend"],
  [/\bstaff[-\s]?wise\s+expense\s+reports?\b/gi, "staff wise expense report"],
  [/\bemployee\s+expense\s+trends?\b/gi, "employee expense trend"],
  [/\blate\s+list\b/gi, "late comers"],
  [/\bleave\s+balance\b/gi, "leave balance"],
  [/\bmy\s+leave\s+balance\b/gi, "leave balance"],
  [/\bapproved\s+leave\b/gi, "leave"],
  [/\bupcoming\s+leave\b/gi, "leave"],
  [/\bactive\s+staff\b/gi, "staff list"],
  [/\bstaff\s+count\b/gi, "staff list"],
  [/\bhow many staff\b/gi, "staff list"],
  [/\bcash\s+at\s+bank\b/gi, "bank accounts"],
  [/\baccount\s+balances?\b/gi, "bank accounts"],
  [/\bbank\s+balances?\b/gi, "bank accounts"],
  [/\bstatement\s+balances?\b/gi, "bank recon"],
  [/\bunreconciled\b/gi, "bank recon"],
  [/\btrial\s+balance\b/gi, "accounts ledger"],
  [/\bbalance\s+sheet\b/gi, "accounts ledger"],
  [/\bcash\s+book\b/gi, "accounts ledger"],
  [/\bday\s+book\b/gi, "accounts ledger"],
  [/\bbank\s+book\b/gi, "bank recon"],
  [/\bchart\s+of\s+accounts\b/gi, "accounts ledger"],
  [/\bcredit\s+notes?\b/gi, "credit notes"],
  [/\bdebit\s+notes?\b/gi, "credit notes"],
  [/\bdelivery\s+challans?\b/gi, "delivery"],
  [/\bpending\s+deliver(?:y|ies)\b/gi, "delivery pending"],
  [/\bdeliver(?:y|ies)\s+pending\b/gi, "delivery pending"],
  [/\bdelayed\s+deliver(?:y|ies)\b/gi, "delivery delayed"],
  [/\bdeliver(?:y|ies)\s+delayed\b/gi, "delivery delayed"],
  [/\blate\s+deliver(?:y|ies)\b/gi, "delivery delayed"],
  [/\bdeliver(?:y|ies)\s+late\b/gi, "delivery delayed"],
  [/\bwhat\s+(?:is|was)\s+delivered\b/gi, "delivered"],
  [/\bwhat'?s\s+delivered\b/gi, "delivered"],
  [/\bshipped\b/gi, "dispatch"],
  [/\bpending\s+installations?\b/gi, "installation pending"],
  [/\binstallations?\s+pending\b/gi, "installation pending"],
  [/\bdelayed\s+installations?\b/gi, "installation delayed"],
  [/\binstallations?\s+delayed\b/gi, "installation delayed"],
  [/\binstallation\s+(?:due|due\s+today)\b/gi, "installation pending"],
  [/\bcompleted\s+installations?\b/gi, "installation completed"],
  [/\binstallations?\s+completed\b/gi, "installation completed"],
  [/\bwho\s+(?:handled|did)\s+(?:the\s+)?installations?\b/gi, "installation engineer"],
  [/\bwho\s+(?:handled|did)\s+(?:the\s+)?deliver(?:y|ies)\b/gi, "delivery engineer"],
  [/\bassigned\s+technicians?\b/gi, "installation technician"],
  // Keep delivery/install focus words intact so focus reaches tools/format.
  [/\bopen\s+pos?\b/gi, "purchase orders"],
  [/\bpending\s+pos?\b/gi, "purchase orders"],
  [/\bso\s+pending\b/gi, "sales orders"],
  [/\bpending\s+sos?\b/gi, "sales orders"],
  [/\bopen\s+sos?\b/gi, "sales orders"],
  // Indian ERP: bare/status "PR" is ambiguous (payment vs purchase indent) —
  // do NOT silently map to payment requests. Clarify path owns bare/status PR.
  // Explicit purchase/indent cues expand to purchase requests; payment needs the full phrase.
  [/\b(?:purchase|material)\s+prs?\b/gi, "purchase requests"],
  [/\bprs?\s+(?:indent|indents)\b/gi, "purchase requests"],
  [/\bindent\s+prs?\b/gi, "purchase requests"],
  [/\bpayment\s+prs?\b/gi, "payment requests"],
  [/\bawaiting\s+payment\b/gi, "payment requests"],
  [/\bapproved\s+payments?\b/gi, "payment requests"],
  [/\blast\s+payments?\b/gi, "payment requests"],
  [/\bpayments?\s+approved\b/gi, "payment requests"],
  [/\bmaterial\s+requests?\b/gi, "purchase requests"],
  // Supplier/vendor bill = purchase bill (before supplier→vendors token expand)
  [/\bsuppliers?\s+bills?\b/gi, "purchase bills"],
  [/\bvendor\s+bills?\b/gi, "purchase bills"],
  // Party/debtor OS before outstanding→receivables token expand.
  // Use underscore form so TOKEN_EXPAND does not rewrite "outstanding" → "receivables".
  [/\bparty\s+outstanding\b/gi, "customer_outstanding"],
  [/\bdebtors?\s+outstanding\b/gi, "customer_outstanding"],
  [/\bcustomer\s+outstanding\b/gi, "customer_outstanding"],
  [/\b(?:party|customer|client|debtor)s?\s+os\b/gi, "customer_outstanding"],
  [/\bparty\s+ledger\b/gi, "accounts ledger"],
  [/\bcreditors?\s+outstanding\b/gi, "payables"],
  // Before suppliers→vendors + outstanding→receivables (vendor OS already → payables)
  [/\b(?:vendors?|suppliers?)\s+outstanding\b/gi, "payables"],
  [/\bvendors?\s+os\b/gi, "payables"],
  [/\bsuppliers?\s+os\b/gi, "payables"],
  // Vendor/supplier Hinglish baki/outstanding before generic baki→receivables /
  // normalize baki→outstanding + suppliers→vendors + outstanding→receivables.
  [
    /\b(?:vendors?|suppliers?)\s+(?:ka|ki|ke)\s+(?:outstanding|os|baki|baaki)\b/gi,
    "payables",
  ],
  [/\b(?:vendors?|suppliers?)\s+(?:baki|baaki)\b/gi, "payables"],
  // AP / creditors Hinglish baki before generic baki→receivables (TOKEN_EXPAND ap→payables
  // alone still leaves trailing baki→receivables and dual-routes AR).
  [/\b(?:ap|a\s*\/\s*p|creditors?)\s+(?:ka|ki|ke)\s+(?:outstanding|os|baki|baaki)\b/gi, "payables"],
  [/\b(?:ap|a\s*\/\s*p|creditors?)\s+(?:baki|baaki|outstanding|os)\b/gi, "payables"],
  // Statutory tax phrasing before outstanding→receivables / payable→payables / dues→receivables.
  // GST payable/outstanding/dues/liability + input/output/net GST → GSTR (existing tool).
  // TDS/TCS* stay for acronym clarify (no dedicated TDS/TCS money tool).
  [/\b(?:net\s+)?gst\s+payable\b/gi, "gstr"],
  // Component GST (incl. UGST) + cess payable → GSTR (not purchase-bill payables).
  [/\b(?:[icsu]gst)\s+payable\b/gi, "gstr"],
  [/\bcess\s+payable\b/gi, "gstr"],
  [/\bnet\s+gst\b/gi, "gstr"],
  [/\bgst\s+outstanding\b/gi, "gstr"],
  [/\bgst\s+(?:dues?|liabilit(?:y|ies))\b/gi, "gstr"],
  // Component GST outstanding/dues before outstanding→receivables / dues→receivables.
  [/\b(?:[icsu]gst)\s+(?:outstanding|os|dues?|liabilit(?:y|ies))\b/gi, "gstr"],
  [/\bcess\s+(?:outstanding|os|dues?|liabilit(?:y|ies))\b/gi, "gstr"],
  [/\b(?:input|output)\s+gst\b/gi, "gstr"],
  [/\bgst\s+(?:input|output)\b/gi, "gstr"],
  // input/output tax (+ payable) → GSTR before payable→payables / entity search.
  [/\b(?:input|output)\s+tax(?:\s+payable)?\b/gi, "gstr"],
  [/\bgst\s+returns?\b/gi, "gstr"],
  // GST paid / GST challan before bare challan→delivery (tax payment, not DC).
  [/\bgst\s+(?:paid|payment|challans?)\b/gi, "gstr"],
  [/\bchallans?\s+gst\b/gi, "gstr"],
  // ITC → GSTR (existing tool; no dedicated ITC ledger ask).
  [/\bitc\s+(?:balance|claim|credit|available|outstanding)\b/gi, "gstr"],
  [/\binput\s+tax\s+credit\b/gi, "gstr"],
  [/\btds\s+(?:outstanding|payable|os|dues|liabilit(?:y|ies))\b/gi, "tds_clarify"],
  [/\btcs\s+(?:outstanding|payable|os|dues|liabilit(?:y|ies))\b/gi, "tcs_clarify"],
  // WHT = TDS synonym (India) before payable→payables / entity search.
  [/\bwithholding\s+tax(?:\s+(?:outstanding|payable|os|dues|liabilit(?:y|ies)))?\b/gi, "tds_clarify"],
  [/\bwht(?:\s+(?:outstanding|payable|os|dues|liabilit(?:y|ies)))?\b/gi, "tds_clarify"],
  // Reverse charge / RCM → GSTR (existing tool).
  [/\breverse\s+charges?(?:\s+gst)?\b/gi, "gstr"],
  [/\brcm(?:\s+gst)?\b/gi, "gstr"],
  [/\bgst\s+refunds?\b/gi, "gstr"],
  [/\bb2b\s+gst\b/gi, "gstr"],
  [/\bnil[\s-]?rated\b/gi, "gstr"],
  [/\bexempt\s+supply\b/gi, "gstr"],
  [/\bbills?\s+of\s+supply\b/gi, "gstr"],
  [/\bcomposition\s+gst\b/gi, "gstr"],
  // PF/ESI/PT statutory dues before bare dues→receivables.
  [/\b(?:pf|epf|esi)\s+(?:dues?|outstanding|payable|os)\b/gi, "salary"],
  [/\bprofessional\s+tax(?:\s+(?:dues?|outstanding|payable|os))?\b/gi, "salary"],
  [/\bpt\s+(?:dues?|outstanding|payable|os)\b/gi, "salary"],
  // JV status → journal/accounts (before entity search).
  [/\b(?:pending|open)\s+jvs?\b/gi, "journal"],
  [/\bjvs?\s+(?:pending|open|list|status)\b/gi, "journal"],
  [/\bjournal\s+vouchers?\b/gi, "journal"],
  // IRN → gst docs (e-invoice).
  [/\birns?(?:\s+status)?\b/gi, "e-invoice"],
  // CN + GST compound → credit notes (before entity search).
  [/\bcns?\s+gst\b/gi, "credit notes"],
  [/\bgst\s+cns?\b/gi, "credit notes"],
  // Bare proforma → sales (proforma invoice already sales).
  [/\bproformas?\b/gi, "sales"],
  // Bank contra → bank recon.
  [/\b(?:bank\s+)?contras?(?:\s+entr(?:y|ies))?\b/gi, "bank recon"],
  // Compound e-way spelling before token match on bare "eway".
  [/\beway\s*bills?\b/gi, "eway bill"],
  [/\be[\s-]?way\s*bills?\b/gi, "eway bill"],
  // Hinglish linker: “party ka OS / client ke outstanding”
  [
    /\b(?:party|customer|client|debtor)s?\s+(?:ka|ki|ke)\s+(?:outstanding|os)\b/gi,
    "customer_outstanding",
  ],
  // Credit/debit note status (bare CN/DN alone stays ambiguous — may be a party code)
  [/\b(?:pending|open)\s+cns?\b/gi, "credit notes"],
  [/\bcns?\s+(?:pending|open|list|status)\b/gi, "credit notes"],
  [/\b(?:pending|open)\s+dns?\b/gi, "credit notes"],
  [/\bdns?\s+(?:pending|open|list|status)\b/gi, "credit notes"],
  // Colloquial dues / udhaar / baki (before outstanding→receivables / paisa→receipts)
  [/\bpending\s+dues\b/gi, "receivables"],
  [/\bdues\b/gi, "receivables"],
  [/\budhaars?\b/gi, "receivables"],
  [/\b(?:baki|baaki)\s+(?:pais[ae]|paise|amount|hai|hain)\b/gi, "receivables"],
  [/\b(?:kitn[aei]\s+)?(?:baki|baaki)\b/gi, "receivables"],
  [/\bgross\s+margins?\b/gi, "fund position"],
  [/\bgp\s+margins?\b/gi, "fund position"],
  [/\bmargins?\s+report\b/gi, "fund position"],
  [/\bregularize\b/gi, "regularisation"],
  [/\bregularise\b/gi, "regularisation"],
  [/\bregularization\b/gi, "regularisation"],
  [/\breimbursements?\b/gi, "staff reimbursement"],
  [/\bexpense\s+claims?\b/gi, "staff expense claims"],
  [/\bclaimed\b/gi, "staff expense claimed"],
  [/\bspends?\b/gi, "staff spend"],
  [/\bspent\b/gi, "staff spend"],
  [/\bperformance\s+scores?\b/gi, "kpi"],
  [/\bindividual\s+staff\s+kpi\b/gi, "all staff kpi"],
  [/\bindividual\s+kpi\b/gi, "all staff kpi"],
  [/\beach\s+staff\s+kpi\b/gi, "all staff kpi"],
  [/\bstaff\s+kpi\b/gi, "all staff kpi"],
  [/\bincentive\s+scores?\b/gi, "kpi"],
  [/\bkiska\s+kpi\b/gi, "kpi"],
  [/\bkpi\s+list\b/gi, "all staff kpi"],
  [/\bmy\s+kpi\b/gi, "my kpi"],
  [/\bmy\s+incentives?\b/gi, "my incentives"],
  [/\bwhat'?s\s+on\s+my\s+plate\b/gi, "my work"],
  [/\bmy\s+work\b/gi, "my work"],
  [/\b(daily|morning|role)\s+brief(ing)?\b/gi, "daily brief"],
  [/\btoday'?s?\s+brief\b/gi, "daily brief"],
  [/\bdark\s+mode\b/gi, "appearance"],
  [/\blight\s+mode\b/gi, "appearance"],
  [/\bdark\s+theme\b/gi, "appearance"],
  [/\blight\s+theme\b/gi, "appearance"],
  [/\bui\s+theme\b/gi, "appearance"],
  [/\bdocument\s+vault\b/gi, "documents"],
  [/\bdoc\s+vault\b/gi, "documents"],
  [/\bmy\s+files\b/gi, "documents"],
  [/\battachment\s+library\b/gi, "documents"],
  [/\bcompany\s+profile\b/gi, "company settings"],
];

/** Single-token / short synonym → canonical token inserted into query. */
const TOKEN_EXPAND: [RegExp, string][] = [
  [/\bcollections?\b/gi, "receipts"],
  [/\bcollected\b/gi, "receipts"],
  [/\bar\b/gi, "receivables"],
  [/\bap\b/gi, "payables"],
  [/\bdebtors?\b/gi, "receivables"],
  [/\bcreditors?\b/gi, "payables"],
  [/\bindents?\b/gi, "purchase requests"],
  [/\bgrns?\b/gi, "grn"],
  [/\bmrns?\b/gi, "grn"],
  [/\bchallans?\b/gi, "delivery"],
  [/\bdcs?\b/gi, "delivery"],
  [/\bdispatch(?:es|ed)?\b/gi, "delivery"],
  [/\bshipped\b/gi, "delivery"],
  [/\bdelivered\b/gi, "delivery"],
  [/\binstallations?\b/gi, "installation"],
  [/\btechnicians?\b/gi, "installation"],
  [/\bsuppliers?\b/gi, "vendors"],
  [/\bclients?\b/gi, "customers"],
  [/\bturnover\b/gi, "sales"],
  [/\brevenue\b/gi, "sales"],
  [/\bbilled\b/gi, "sales"],
  [/\binvoiced\b/gi, "sales"],
  [/\bbilling\b/gi, "sales"],
  [/\bheadcount\b/gi, "staff list"],
  [/\bemployees?\b/gi, "staff list"],
  [/\bpayroll\b/gi, "salary"],
  [/\bpayslips?\b/gi, "salary"],
  [/\bwages?\b/gi, "salary"],
  [/\bcommissions?\b/gi, "incentives"],
  [/\bbonus\b/gi, "incentives"],
  [/\binventory\b/gi, "stock"],
  [/\bskus?\b/gi, "stock"],
  [/\bwarehouse\b/gi, "stock"],
  [/\baging\b/gi, "receivables"],
  [/\bageing\b/gi, "receivables"],
  [/\boutstanding\b/gi, "receivables"],
  [/\bquotes?\b/gi, "quotations"],
  [/\breconcil(?:e|iation|ed|ing)?\b/gi, "bank recon"],
];

const NOVA_LEXICON_DEFS: NovaLexiconTopic[] = [
  {
    id: "receipts",
    label: "receipts",
    synonyms: [
      "receipt",
      "receipts",
      "collection",
      "collections",
      "collected",
      "money in",
      "rcpt",
      "paisa",
      "paise",
      "rupaya",
      "rupaye",
    ],
    tools: ["receipts_summary"],
    permissions: ["receipt.read"],
    moneyWord: true,
    href: "/receipts",
    bindsWith: ["period", "person"],
    ambiguousAlone: true,
    clarifyPrompt: "Which period for receipts — today, this month, or FY?",
  },
  {
    id: "sales_invoices",
    label: "billing / invoices",
    synonyms: [
      "sales",
      "revenue",
      "turnover",
      "billing",
      "billed",
      "invoiced",
      "invoice",
      "invoices",
      "sales invoices",
      "gst bill",
      "tax invoice",
      "si",
    ],
    tools: ["sales_summary"],
    permissions: ["invoice.read"],
    moneyWord: true,
    href: "/billing",
    bindsWith: ["period", "person"],
    ambiguousAlone: true,
    clarifyPrompt: "Which period for sales — today, this month, or FY?",
  },
  {
    id: "receivables",
    label: "receivables",
    synonyms: ["receivable", "receivables", "ar", "debtor", "debtors", "aging", "outstanding"],
    tools: ["receivables_summary", "overdue_invoices"],
    permissions: ["invoice.read"],
    href: "/accounts/receivables",
  },
  {
    id: "collection_delay_estimate",
    label: "collection delay estimate",
    synonyms: [
      "collection delay",
      "collection delay estimate",
      "collection_delay_estimate",
      "payment delay estimate",
      "payment delay prediction",
      "when will they pay",
      "collection prediction",
    ],
    tools: ["collection_delay_estimate"],
    permissions: ["invoice.read"],
    href: "/billing",
  },
  {
    id: "payables",
    label: "purchase bills",
    synonyms: ["payable", "payables", "ap", "creditor", "creditors", "vendor bill", "vendor bills", "supplier bill", "supplier bills", "purchase total", "purchase bill", "purchase bills"],
    tools: ["purchase_bills_summary"],
    permissions: ["purchasebill.read"],
    href: "/purchase-bills",
  },
  {
    id: "purchase_requests",
    label: "purchase requests",
    synonyms: [
      "purchase request",
      "purchase requests",
      "indent",
      "indents",
      "material request",
      "material indent",
      "material indents",
    ],
    tools: ["purchase_requests_summary"],
    permissions: ["purchaserequest.read", "purchaserequest.create"],
    ambiguousWith: ["payment_requests"],
    href: "/purchase-requests",
  },
  {
    id: "purchase_orders",
    label: "purchase orders",
    synonyms: ["purchase order", "purchase orders", "po", "open po", "open pos"],
    tools: ["purchase_orders_summary"],
    permissions: ["purchaseorder.read"],
    href: "/purchase-orders",
  },
  {
    id: "sales_orders",
    label: "sales orders",
    synonyms: ["sales order", "sales orders", "so", "open orders", "so pending"],
    tools: ["sales_orders_summary"],
    permissions: ["salesorder.read"],
    href: "/sales-orders",
  },
  {
    id: "projects",
    label: "projects",
    synonyms: [
      "project",
      "projects",
      "project value",
      "biggest project",
      "largest project",
      "confirmed projects",
      "projects confirmed",
      "new projects",
      "new orders",
      "orders confirmed",
      "confirmed orders",
    ],
    tools: ["projects_summary"],
    permissions: ["project.read"],
    href: "/projects",
  },
  {
    id: "customers",
    label: "customers",
    synonyms: ["customer", "customers", "client", "clients"],
    tools: ["customers_summary"],
    permissions: ["customer.read"],
    href: "/customers",
  },
  {
    id: "vendors",
    label: "vendors",
    synonyms: ["vendor", "vendors", "supplier", "suppliers"],
    tools: ["vendors_summary"],
    permissions: ["vendor.read"],
    href: "/vendors",
  },
  {
    id: "bank_accounts",
    label: "bank accounts",
    synonyms: ["bank account", "bank accounts", "bank balance", "cash at bank", "account balances"],
    tools: ["bank_accounts_summary"],
    permissions: ["bank.read"],
    confidential: true,
    href: "/bank-accounts",
  },
  {
    id: "bank_recon",
    label: "reconciliation",
    synonyms: ["bank recon", "reconciliation", "unreconciled", "statement", "statement balance", "bank book"],
    tools: ["bank_recon_summary"],
    permissions: ["bank.reconcile", "bank.read"],
    confidential: true,
    href: "/reconciliation",
  },
  {
    id: "stock",
    label: "stock",
    synonyms: ["stock", "inventory", "sku", "warehouse", "low stock", "out of stock", "stock shortage", "reorder level"],
    tools: ["stock_summary"],
    permissions: ["stock.read"],
    href: "/stock",
  },
  {
    id: "delivery",
    label: "delivery",
    synonyms: [
      "delivery",
      "deliveries",
      "delivery pending",
      "pending delivery",
      "pending deliveries",
      "dispatch",
      "dispatched",
      "shipped",
      "delivered",
      "installation",
      "installations",
      "installation pending",
      "pending installation",
      "installation delayed",
      "installation completed",
      "installation due",
      "technician",
      "challan",
      "challans",
      "dc",
      "delivery delay",
      "delivery delays",
      "delayed delivery",
      "delayed deliveries",
      "delay",
      "delays",
    ],
    tools: ["delivery_summary"],
    permissions: ["delivery.read"],
    href: "/delivery",
  },
  {
    id: "tasks",
    label: "tasks",
    synonyms: ["task", "tasks", "todo", "to-do", "overdue task", "completed tasks", "who completed", "finished tasks"],
    tools: ["tasks_summary"],
    permissions: ["task.read.self"],
    href: "/tasks",
    bindsWith: ["period", "status", "person"],
  },
  {
    id: "kpi",
    label: "KPI",
    synonyms: [
      "kpi",
      "performance score",
      "staff kpi",
      "incentive score",
      "my kpi",
      "kpi report",
      "kpi trend report",
      "kpi scores report",
      "kpi summary",
      "kpi summary report",
      "staff kpi summary",
      "all staff kpi",
      "all kpi summary",
      "kpi changes",
    ],
    tools: ["kpi_summary"],
    permissions: ["kpi.read.self", "kpi.read.team", "kpi.read.all"],
    href: "/kpi",
    bindsWith: ["person", "period"],
  },
  {
    id: "kpi_report",
    label: "KPI report card",
    synonyms: [
      "kpi report card",
      "report card kpi",
      "kpi breakdown",
      "kpi detail",
      "kpi scorecard",
    ],
    tools: ["kpi_report"],
    permissions: ["kpi.read.self", "kpi.read.team", "kpi.read.all"],
    href: "/kpi/my-performance",
    bindsWith: ["person"],
  },
  {
    id: "attendance",
    label: "attendance",
    synonyms: [
      "attendance",
      "late comers",
      "latecomers",
      "late list",
      "punch",
      "punched",
      "punched in",
      "punch out",
      "punch-out",
      "punch out time",
      "out times",
      "late minutes",
      "absent",
      "absentees",
      "absentee",
      "absent list",
      "absentee list",
      "no show",
      "present",
      "present list",
      "who was absent",
      "who was present",
      "who didn't punch",
      "who did not punch",
      "missing punch",
      "who punched late",
      "who came late",
      // bare "late" is composed via nova-intent (R1–R4); keep phrase synonyms here
    ],
    tools: ["attendance_late_summary"],
    permissions: ["hr.attendance.team", "hr.attendance.read", "hr.punch.self"],
    href: "/attendance-hr",
    focusHints: ["overview", "late", "absent", "present", "punch_out"],
    bindsWith: ["period", "person"],
    conflictsWith: [
      /\blate\s+payment\b/i,
      /\blate\s+fee\b/i,
      /\blate\s+charge\b/i,
      /\bpayment\s+late\b/i,
    ],
    ambiguousAlone: true,
    clarifyPrompt: "For attendance, which period — today, this week, or this month?",
  },
  {
    id: "leave",
    label: "leave",
    synonyms: [
      "leave",
      "on leave",
      "leave request",
      "pending leave",
      "leave balance",
      "leave status",
      "approved leave",
      "upcoming leave",
      "my leave",
      "my leave balance",
      "chutti",
      "chhutti",
    ],
    tools: ["leave_summary"],
    permissions: ["hr.leave.create", "hr.leave.read", "hr.leave.approve"],
    href: "/attendance-hr/leave",
  },
  {
    id: "overtime",
    label: "overtime",
    synonyms: [
      "overtime",
      "pending overtime",
      "ot pending",
      "overtime pending",
      "overtime queue",
      "ot queue",
      "approve ot",
      "ot approvals",
    ],
    tools: ["overtime_summary"],
    permissions: ["hr.overtime.read", "hr.overtime.approve", "hr.overtime.create"],
    href: "/attendance-hr/overtime",
  },
  {
    id: "regularisation",
    label: "regularisation",
    synonyms: [
      "regularisation",
      "regularization",
      "pending regularisation",
      "pending regularization",
      "regularisation queue",
      "regularization queue",
      "fix attendance",
      "attendance fix request",
    ],
    tools: ["regularisation_summary"],
    permissions: [
      "hr.regularisation.read",
      "hr.regularisation.approve",
      "hr.regularisation.create",
    ],
    href: "/attendance-hr/regularisation",
  },
  {
    id: "staff_advances",
    label: "staff advances",
    synonyms: [
      "staff advance",
      "staff advances",
      "advances",
      "advance balance",
      "pending advance",
      "pending advances",
      "advance pending approval",
      "staff advance pending approval",
      "pending advance approval",
      "pending settlement advance",
      "pending settlement advances",
      "staff advance pending settlement",
      "advance settlement",
      "advance requested",
      "requested advance",
      "took advance",
      "taken advance",
    ],
    tools: ["staff_advances_summary"],
    permissions: ["staffadvance.read", "staffadvance.self.create"],
    href: "/staff-advances",
  },
  {
    id: "payment_requests",
    label: "payment requests",
    synonyms: [
      "payment request",
      "payment requests",
      "payment",
      "payments",
      "awaiting payment",
      "approved payments",
      "last payments",
    ],
    tools: ["payment_requests_summary"],
    permissions: ["paymentrequest.read", "paymentrequest.create"],
    ambiguousWith: ["purchase_requests"],
    conflictsWith: [
      /\blate\s+payment\b/i,
      /\bpayment\s+late\b/i,
      /\bexpense\s+payment\b/i,
      /\badvance\s+payment\b/i,
      /\blate\s+fee\b/i,
      /\blate\s+charge\b/i,
    ],
    href: "/payment-requests",
  },
  {
    id: "approvals",
    label: "approvals",
    synonyms: ["approval", "approvals", "pending approval", "my approvals", "approval queue", "pending approvals", "waiting approvals"],
    tools: ["approvals_summary"],
    permissions: ["approval.read.self", "approval.read.team", "approval.read.all"],
    href: "/approvals",
  },
  {
    id: "staff_expenses",
    label: "staff expenses",
    synonyms: [
      "staff expense",
      "staff expenses",
      "staff spend",
      "staff spending",
      "staff wise expense",
      "staff wise expense report",
      "employee expense",
      "employee expense trend",
      "expense",
      "expenses",
      "kharcha",
      "expense payment",
      "expense report",
      "expenses report",
      "manual expense",
      "general expense",
      "reimbursement",
      "reimbursements",
      "staff reimbursement",
      "reimbursement request",
      "pending reimbursement",
      "expense claim",
      "expense claims",
      "claimed reimbursement",
      "top reimbursement claimants",
    ],
    tools: ["staff_expense_summary"],
    permissions: ["accounts.dashboard.read", "accounts.read", "accounts.reports.read"],
    href: "/accounts/expenses",
  },
  {
    id: "incentives",
    label: "incentives",
    synonyms: ["incentive", "incentives", "bonus", "bonus payout", "commission", "commissions", "sales incentive", "my incentives"],
    tools: ["incentives_summary"],
    permissions: ["incentive.read.self", "incentive.read.team", "incentive.read.all"],
    href: "/kpi/incentives",
  },
  {
    id: "cbg_quotations",
    label: "CBG quotations",
    synonyms: ["cbg", "quotation", "quotations", "quote", "quotes"],
    tools: ["cbg_quotations_summary"],
    permissions: ["cbgquotation.read"],
    href: "/cbg-quotations",
  },
  {
    id: "daily_brief",
    label: "daily brief",
    synonyms: [
      "daily brief",
      "morning brief",
      "role brief",
      "today brief",
      "today's brief",
      "my brief",
      "daily briefing",
      "director brief",
    ],
    tools: ["daily_brief"],
    permissions: ["ai.assistant.read"],
    href: "/ai-assistant",
  },
  {
    id: "proactive_insights",
    label: "proactive insights",
    synonyms: [
      "proactive insights",
      "insights",
      "insight cards",
      "what needs attention",
      "attention queue",
      "needs attention",
      "exceptions queue",
    ],
    tools: ["proactive_insights"],
    permissions: ["ai.assistant.read"],
    href: "/ai-assistant",
  },
  {
    id: "nova_analysis",
    label: "NOVA Analysis",
    synonyms: [
      "nova analysis",
      "why is my kpi low",
      "why is my kpi high",
      "why kpi",
      "kpi analysis",
      "analyse kpi",
      "analyze kpi",
      "kpi summary of",
      "why overdue",
      "analyze this project",
      "analyse this project",
      "project analysis",
      "why outstanding",
      "why is outstanding high",
      "attendance analysis",
      "why late",
      "why is my score",
      "why so many late",
      "why is Amit kpi low",
      "mera kpi kyun",
      "kpi kyun kam",
    ],
    tools: ["nova_analysis"],
    permissions: ["ai.assistant.read"],
    href: "/kpi",
    bindsWith: ["person", "period"],
    conflictsWith: [
      /\blate\s+payment\b/i,
      /\blate\s+fee\b/i,
      /\blate\s+charge\b/i,
      /\bpayment\s+late\b/i,
      /\blate\s+invoices?\b/i,
      /\binvoices?\s+late\b/i,
      /\blate\s+deliver(?:y|ies)\b/i,
      /\bdeliver(?:y|ies)\s+late\b/i,
      /\blate\s+dispatch(?:es)?\b/i,
    ],
  },
  {
    id: "nova_trend",
    label: "NOVA Trend",
    synonyms: [
      "nova trend",
      "who is frequently late",
      "frequently late",
      "always late",
      "late trend",
      "late punch trend",
      "late comers trend",
      "latecomers trend",
      "attendance late over time",
      "over time late",
      "who completes tasks after overdue",
      "completes after overdue",
      "late completion trend",
      "task overdue completion trend",
      "always overdue",
      "frequently overdue",
      "ar aging trend",
      "outstanding trend",
      "receivables trend",
      "aging worsening",
      "kpi trend",
      "kpi score trend",
      "kpi trajectory",
      "kpi trend for",
      "kpi changes",
      "kpi trend report",
      "high kpi streak",
      "who has high kpi for a long streak",
      "sustained high kpi",
    ],
    tools: ["nova_trend"],
    permissions: ["ai.assistant.read"],
    href: "/ai-assistant",
    bindsWith: ["person", "period"],
    conflictsWith: [
      /\bwhy\b/i,
      /\blate\s+payment\b/i,
      /\blate\s+fee\b/i,
      /\bpayment\s+late\b/i,
      /\blate\s+invoices?\b/i,
    ],
  },
  {
    id: "collection_attention",
    label: "collection attention",
    synonyms: [
      "collection attention",
      "collections focus",
      "collection status",
      "outstanding and overdue",
      "overdue and outstanding",
    ],
    tools: ["collection_attention"],
    permissions: ["invoice.read", "receipt.read"],
    href: "/accounts/receivables",
    bindsWith: ["period"],
  },
  {
    id: "month_performance",
    label: "month performance",
    synonyms: [
      "month performance",
      "how is this month going",
      "how is july going",
      "how is business",
      "how's business",
      "how are we doing",
      "business overview",
      "business health",
      "director brief",
      "director brief for this month",
      "this month going",
      "month summary",
    ],
    tools: ["month_performance"],
    permissions: ["ai.assistant.read"],
    href: "/ai-assistant",
    bindsWith: ["period"],
  },
  {
    id: "attendance_month",
    label: "attendance month",
    synonyms: [
      "how is this month's attendance",
      "how is this month attendance",
      "attendance this month",
      "this month attendance",
      "month attendance overview",
      "attendance for july",
    ],
    tools: ["attendance_month"],
    permissions: ["hr.attendance.read", "hr.attendance.team", "hr.punch.self"],
    href: "/attendance-hr/register",
    bindsWith: ["period"],
  },
  {
    id: "cash_banking",
    label: "cash banking",
    synonyms: [
      "how is cash this week",
      "cash and banking",
      "cash position",
      "bank balances",
      "total bank balance",
      "how is banking going",
      "receipts and bank",
    ],
    tools: ["cash_banking"],
    permissions: ["bank.read"],
    href: "/bank-accounts",
    bindsWith: ["period"],
  },
  {
    id: "project_command",
    label: "project command",
    synonyms: [
      "project command",
      "everything important about this project",
      "tell me everything about this project",
      "project deep dive",
      "project briefing",
    ],
    tools: ["project_command"],
    permissions: ["project.read"],
    href: "/projects",
    bindsWith: ["status"],
  },
  {
    id: "my_work",
    label: "my work",
    synonyms: ["my work", "my tasks", "my kpi", "my attendance", "my leave", "my advances"],
    tools: ["my_work_summary"],
    permissions: ["task.read.self", "kpi.read.self", "hr.leave.create", "ai.assistant.read"],
    href: "/tasks",
  },
  {
    id: "staff",
    label: "staff",
    synonyms: [
      "staff list",
      "staff directory",
      "employees",
      "employee",
      "staff",
      "headcount",
      "how many staff",
      "active staff",
      "staff count",
      "staff profile",
      "who is staff",
    ],
    tools: ["staff_summary"],
    permissions: ["staff.read", "hr.employee.read"],
    href: "/staff",
  },
  {
    id: "pending_workflow",
    label: "pending workflow",
    synonyms: ["pending approvals", "pending payments", "pending bills", "awaiting approval", "workflow pending"],
    tools: ["pending_workflow_counts"],
    permissions: ["paymentrequest.read", "purchasebill.read", "approval.read.self"],
    href: "/approvals",
    bindsWith: ["status"],
    ambiguousAlone: true,
    clarifyPrompt: "Pending what — approvals, leave, payment requests, or purchase bills?",
  },
  {
    id: "salary",
    label: "salary / payroll",
    synonyms: ["salary", "payroll", "payslip", "payslips", "salary slip", "wage", "wages", "net pay"],
    tools: ["salary_summary"],
    permissions: ["hr.salary.read", "hr.payslip.read", "hr.payslip.self"],
    confidential: true,
    href: "/attendance-hr/payroll",
  },
  {
    id: "accounts_ledger",
    label: "accounts / ledgers",
    synonyms: [
      "accounts ledger",
      "journal",
      "ledger",
      "trial balance",
      "balance sheet",
      "cash book",
      "day book",
      "chart of accounts",
    ],
    tools: ["accounts_snapshot"],
    permissions: ["accounts.dashboard.read", "accounts.reports.read"],
    confidential: true,
    href: "/accounts",
  },
  {
    id: "tally",
    label: "Tally",
    synonyms: ["tally", "tally sync"],
    tools: ["tally_status"],
    permissions: ["tally.dashboard.view"],
    confidential: true,
    href: "/tally",
  },
  {
    id: "grn",
    label: "material receipts / GRN",
    synonyms: ["grn", "mrn", "material receipt", "goods receipt", "goods received note", "material inward", "goods inward"],
    tools: ["grn_summary"],
    permissions: ["stock.read", "purchaserequest.read", "purchaseorder.read"],
    href: "/stock",
  },
  {
    id: "credit_notes",
    label: "credit / debit notes",
    synonyms: ["credit notes", "debit notes", "credit note", "debit note"],
    tools: ["credit_notes_summary"],
    permissions: ["invoice.read"],
    href: "/billing",
  },
  {
    id: "order_book",
    label: "order book / FY target",
    synonyms: [
      "order book",
      "pipeline",
      "order book target",
      "fy target",
      "target order book",
      "orderbook",
    ],
    tools: ["order_book_summary"],
    permissions: ["director.dashboard", "finance.dashboard.read", "accounts.dashboard.read"],
    moneyWord: true,
    href: "/director",
  },
  {
    id: "gst_docs",
    label: "GST documents",
    synonyms: [
      "e-invoice",
      "einvoice",
      "e-way",
      "eway",
      "eway bill",
      "ewaybill",
      "e-way bill",
      "gst portal",
      "gst docs",
      "einvoice status",
      "irn",
      "irn status",
    ],
    tools: ["gst_docs_summary"],
    permissions: ["invoice.read"],
    href: "/accounts/gst-summary",
  },
  {
    id: "vendor_bank",
    label: "vendor bank details",
    synonyms: [
      "vendor bank",
      "beneficiary",
      "vendor beneficiary",
      "bank details",
      "vendor bank details",
    ],
    tools: ["vendor_bank_open"],
    permissions: ["vendorbank.read", "bank.viewfullaccount"],
    confidential: true,
    href: "/vendors",
  },
  {
    id: "documents",
    label: "documents",
    synonyms: ["documents", "document vault", "files", "attachments library", "doc vault", "my files"],
    tools: ["documents_open"],
    /** Must match documents.read / route-access — soft-deny when Staff lack the grant. */
    permissions: ["documents.read"],
    href: "/documents",
  },
  {
    id: "documents_search",
    label: "document search",
    synonyms: [
      "search documents",
      "find document",
      "find documents",
      "find file",
      "find pdf",
      "document search",
      "search files",
      "lookup attachment",
      "search attachment",
      "plant photos",
      "site images",
      "project photos",
      "project pictures",
      "site pictures",
    ],
    tools: ["documents_search"],
    permissions: ["documents.read"],
    href: "/documents",
  },
  {
    id: "nova_pulse",
    label: "NOVA Pulse (what changed)",
    synonyms: [
      "what changed",
      "any changes",
      "pulse",
      "nova pulse",
      "change events",
      "task changes",
      "files uploaded",
      "file uploaded",
      "uploaded on task",
      "changes in tasks",
      "assigned by me",
      "recent changes",
      "activity on tasks",
    ],
    tools: ["nova_pulse_search"],
    permissions: ["task.read.self", "documents.read"],
    href: "/tasks",
    bindsWith: ["person", "period"],
  },
  {
    id: "settings",
    label: "settings",
    synonyms: ["settings", "system settings", "company settings", "preferences"],
    tools: ["settings_open"],
    permissions: ["settings.write"],
    href: "/settings",
  },
  {
    id: "appearance",
    label: "appearance",
    synonyms: [
      "appearance",
      "theme",
      "dark mode",
      "light mode",
      "dark theme",
      "light theme",
      "display preferences",
      "display settings",
      "ui theme",
    ],
    tools: ["appearance_open"],
    /** Personal theme/language — route `/settings/appearance` has no permission gate. */
    permissions: ["ai.assistant.read"],
    href: "/settings/appearance",
  },
  {
    id: "notifications",
    label: "notifications",
    synonyms: ["notifications", "notification", "alerts", "bell"],
    tools: ["notifications_open"],
    permissions: ["ai.assistant.read"],
    href: "/notifications",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    synonyms: ["whatsapp", "whats app", "wa messages", "whatsapp inbox"],
    tools: ["whatsapp_open"],
    permissions: ["whatsapp.read"],
    href: "/whatsapp",
  },
  {
    id: "portal",
    label: "portal",
    synonyms: ["portal", "customer portal", "vendor portal"],
    tools: ["portal_open"],
    permissions: ["portal.read"],
    href: "/portal",
  },
  {
    id: "automation",
    label: "automation",
    synonyms: ["automation", "automations", "workflows automation"],
    tools: ["automation_open"],
    permissions: ["automation.read"],
    href: "/automation",
  },
  {
    id: "links",
    label: "links",
    synonyms: ["links", "useful links", "quick links", "link library"],
    tools: ["links_open"],
    permissions: ["links.read"],
    href: "/links",
  },
  {
    id: "bank_sms",
    label: "bank SMS",
    synonyms: ["bank sms", "sms entries", "bank sms entries", "paste sms"],
    tools: ["bank_sms_open"],
    permissions: ["bank.sms.read"],
    confidential: true,
    href: "/accounts/bank-sms",
  },
  {
    id: "system_backup",
    label: "system backup",
    synonyms: ["system backup", "backup", "backups", "backup restore", "restore backup"],
    tools: ["backup_open"],
    /** Soft/hard deny for non-admin roles; tool also requires canViewBackupHistory. */
    permissions: ["director.dashboard"],
    confidential: true,
    href: "/system/backup",
  },
  {
    id: "system_tools",
    label: "system tools",
    synonyms: ["system tools", "admin tools", "platform tools"],
    tools: ["system_tools_open"],
    /** ADMIN/SUPER_ADMIN (ALL) + DIRECTOR; tool also role-gates. */
    permissions: ["director.dashboard"],
    confidential: true,
    href: "/system/tools",
  },
  {
    id: "audit_log",
    label: "audit log",
    synonyms: ["audit log", "audit logs", "erp audit log", "activity log"],
    tools: ["audit_log_open"],
    permissions: ["audit.read"],
    confidential: true,
    href: "/system/audit-log",
  },
  {
    id: "profitability",
    label: "project profitability / fund views",
    synonyms: [
      "profitability",
      "profit",
      "profits",
      "margins",
      "margin",
      "fund position",
      "pnl",
      "p&l",
      "profit and loss",
      "profit loss",
      "project pnl",
      "project p&l",
      "project profit",
      "project profits",
      "project wise profit",
      "project-wise profit",
      "project wise profits",
      "profits by project",
      "project profit loss",
      "project loss",
      "project on loss",
      "project in loss",
      "project at loss",
      "projects at loss",
      "any project at loss",
      "loss making project",
      "loss-making project",
      "loss making projects",
      "loss-making projects",
      "project margin",
      "project margins",
      "negative margin",
    ],
    tools: ["profitability_summary"],
    permissions: ["project.profitability.view"],
    confidential: true,
    href: "/projects",
  },
  {
    id: "finance_dashboard",
    label: "director / finance dashboard",
    synonyms: [
      "director dashboard",
      "finance dashboard",
      "accounts dashboard",
      "company dashboard",
      "financial overview",
      "fy overview",
    ],
    tools: ["director_dashboard_summary"],
    permissions: ["director.dashboard", "finance.dashboard.read", "accounts.dashboard.read"],
    href: "/director",
  },
  {
    id: "reports",
    label: "reports",
    synonyms: [
      "report",
      "reports",
      "sales register",
      "ar aging",
      "receivable aging",
      "ap aging",
      "gstr",
      "gstr-1",
      "gstr1",
      "gstr-3b",
      "gstr3b",
      "erp reports",
      "erp report",
    ],
    tools: ["reports_snapshot", "gstr_snapshot"],
    permissions: ["reports.read"],
    conflictsWith: [
      /\bexpenses?\s+reports?\b/i,
      /\bfinance\s+reports?\b/i,
      /\bfinancial\s+reports?\b/i,
      // KPI report / summary report → kpi_summary pack, never FY/GSTR snapshot
      /\bkpi\b/i,
      // Chat “save/give report” = NOVA pack snapshot, not ERP /reports
      /\b(save|giv+|give|download|donwload|dl)\s+(me\s+)?(a\s+|the\s+|this\s+)?(report|reprot|raport|pdf)s?\b/i,
      /\b(save|download)\s+this(\s+(one|pack|answer|snapshot))?\b/i,
    ],
    href: "/reports",
  },
  {
    id: "customer_outstanding",
    label: "customer outstanding",
    synonyms: [
      "customer outstanding",
      "customer_outstanding",
      "outstanding for",
      "party outstanding",
      "who owes",
      "client pending payment",
      "customer pending payment",
      "client pending amount",
      "customer pending amount",
      "payment receivable",
      "payment receivables",
      "pending payment from client",
      "payment pending from customer",
    ],
    tools: ["customer_outstanding"],
    permissions: ["invoice.read"],
    moneyWord: true,
    href: "/accounts/receivables",
  },
];

/**
 * Lexicon topics with tool-derived permission floors (NI-01).
 * Inline `permissions` on defs are documentation only when `tools` is non-empty —
 * runtime values always come from `nova-tool-permissions`.
 */
export const NOVA_LEXICON: NovaLexiconTopic[] = NOVA_LEXICON_DEFS.map((t) =>
  t.tools.length === 0 ? t : { ...t, permissions: novaPermissionsForTools(t.tools) }
);

const TOPIC_BY_ID = new Map(NOVA_LEXICON.map((t) => [t.id, t]));

/** Expand synonyms/phrases to canonical forms used by topic matching. */
export function expandNovaLexicon(query: string): string {
  let q = query;
  for (const [re, rep] of PHRASE_EXPAND) {
    q = q.replace(re, rep);
  }
  for (const [re, rep] of TOKEN_EXPAND) {
    q = q.replace(re, rep);
  }
  // Keep plural receipts after collections→receipts
  q = q.replace(/\breceiptss\b/gi, "receipts");
  return q.replace(/\s+/g, " ").trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function topicMatches(q: string, topic: NovaLexiconTopic): boolean {
  if (topic.conflictsWith?.some((re) => re.test(q))) return false;
  for (const syn of topic.synonyms) {
    const s = syn.toLowerCase();
    if (s.includes(" ")) {
      if (q.includes(s)) return true;
    } else {
      const re = new RegExp(`\\b${escapeRe(s)}\\b`, "i");
      if (re.test(q)) return true;
    }
  }
  return false;
}

export function matchNovaTopics(query: string): NovaLexiconTopic[] {
  const q = expandNovaLexicon(query.trim().toLowerCase());
  if (!q) return [];
  return NOVA_LEXICON.filter((t) => topicMatches(q, t));
}

export function getNovaTopic(id: NovaTopicId): NovaLexiconTopic | undefined {
  return TOPIC_BY_ID.get(id);
}

/** Money-word topics for bare-metric period clarification. */
export function novaMoneyWordPattern(): RegExp {
  const words = NOVA_LEXICON.filter((t) => t.moneyWord)
    .flatMap((t) => t.synonyms.filter((s) => !s.includes(" ")))
    .concat(["collections", "receipts", "sales", "revenue", "turnover", "billing", "invoices"]);
  const uniq = [...new Set(words.map((w) => w.toLowerCase()))];
  return new RegExp(`\\b(${uniq.map(escapeRe).join("|")})\\b`, "i");
}

export function novaBareMoneyWordPattern(): RegExp {
  return /^(sales|revenue|receipts?|collections?|turnover|billing|invoices?)$/i;
}

/**
 * Select tools from matched lexicon topics + structural heuristics.
 */
export function selectToolsFromLexicon(query: string): {
  tools: string[];
  topics: NovaLexiconTopic[];
  interpretedAs: string[];
} {
  const q = expandNovaLexicon(query.trim().toLowerCase());
  // Permission / role-capability asks are not money dumps (Aware handles them).
  if (
    /\bwho\s+can\s+(see|view|access|open|check|read)\b/.test(q) ||
    /\bwho\s+has\s+(access|permission|visibility)\b/.test(q) ||
    /\bcan\s+(\w+)\s+(see|view|access|open|check|read)\b/.test(q) ||
    /\bdoes\s+\w+\s+have\s+(access|permission|visibility|rights?)\b/.test(q) ||
    /\bcan\s+(i|we)\s+(see|view|access|open|check|read)\b/.test(q)
  ) {
    return { tools: [], topics: [], interpretedAs: ["permission_help"] };
  }

  // Explicit Sales Orders documents (not project “orders”)
  if (
    /\bsales\s+orders?\b/.test(q) ||
    /\bso\s+pending\b/.test(q) ||
    (/^open\s+sales\s+orders?$/i.test(q.trim()) || /\bopen\s+sales\s+orders?\b/.test(q))
  ) {
    return {
      tools: ["sales_orders_summary"],
      topics: matchNovaTopics(q).filter((t) => t.id === "sales_orders"),
      interpretedAs: ["sales orders"],
    };
  }

  // Bare / confirmed “orders” → projects confirmed in period (emPOWER product preference)
  if (isNovaConfirmedOrdersAsk(q)) {
    return {
      tools: ["projects_summary"],
      topics: matchNovaTopics(q).filter((t) => t.id === "projects"),
      interpretedAs: ["projects confirmed / new orders"],
    };
  }

  const tools = new Set<string>();
  const topics = matchNovaTopics(q);
  const interpretedAs = topics.map((t) => t.label);

  const isDayOrWeekPeriod =
    /\b(today|todays|today'?s|yesterday|yesterdays|this\s+week|last\s+week|current\s+week)\b/.test(
      q
    );

  const isProjectValueAsk =
    /\b(project\s*value|projects?\s+value|active\s+projects?\s+value)\b/.test(q) ||
    (/\b(biggest|largest|highest|top)\b/.test(q) && /\bprojects?\b/.test(q)) ||
    (/\bprojects?\b/.test(q) &&
      /\b(value|worth|active|open)\b/.test(q) &&
      !/\b(receipt|sales|invoice|collection)\b/.test(q));

  if (isProjectValueAsk) {
    tools.add("projects_summary");
  }

  for (const topic of topics) {
    // Avoid mixing project contract values into receipt/sales day asks
    if (
      topic.id === "projects" &&
      !isProjectValueAsk &&
      (isDayOrWeekPeriod || /\b(receipt|sales|invoice)\b/.test(q))
    ) {
      continue;
    }
    // pending_workflow is broad — only when pending/summary-like
    if (topic.id === "pending_workflow") {
      if (
        /\b(pending|awaiting|approval|payment\s+request|purchase\s+bill|workflow|summary|overview|dashboard|how many|counts?)\b/.test(
          q
        )
      ) {
        for (const t of topic.tools) tools.add(t);
      }
      continue;
    }
    // Don't fire sales_orders on bare "open orders" when PO also intended — still add SO; clarify handles PR
    for (const t of topic.tools) tools.add(t);
  }

  // Vendor bank / beneficiary — presence counts only; never mix vendors_summary
  if (topics.some((t) => t.id === "vendor_bank")) {
    tools.delete("vendors_summary");
    tools.add("vendor_bank_open");
  }

  if (!isProjectValueAsk && /\bhow much\b/.test(q) && /\b(sales|revenue|receipt|invoice|bill)\b/.test(q)) {
    tools.add("sales_summary");
  }

  if (
    !isProjectValueAsk &&
    /\b(\d{1,3}(?:,\d{2}){1,3}|\d{1,3}(?:,\d{3})+|\d{5,})\b/.test(q) &&
    /\b(receipt|rcpt|payment|cheque|neft|utr)\b/.test(q)
  ) {
    tools.add("receipts_summary");
  }

  if (/\b(overdue|unpaid\s+invoice)\b/.test(q) && !/\btask\b/.test(q)) {
    tools.add("overdue_invoices");
  }

  // Bare "dashboard/overview" → director when that topic matched; else light ops pack.
  // Avoid dumping sales+receipts+AR+workflow for every "summary" word.
  if (/\b(director\s+dashboard|finance\s+dashboard|company\s+dashboard|financial\s+overview|fy\s+overview|command\s+center)\b/.test(q)) {
    // handled by early return below
  } else if (/\b(dashboard|overview)\b/.test(q) && !/\b(sales|receipt|invoice|task|project|kpi|bank)\b/.test(q)) {
    if (topics.some((t) => t.id === "finance_dashboard")) {
      tools.add("director_dashboard_summary");
    } else {
      tools.add("pending_workflow_counts");
      tools.add("overdue_invoices");
    }
  } else if (/\bsummary\b/.test(q) && !/\b(sales|receipt|invoice|task|project|kpi|bank|order\s+book|target)\b/.test(q)) {
    tools.add("sales_summary");
    tools.add("receipts_summary");
    tools.add("pending_workflow_counts");
    if (!isDayOrWeekPeriod) tools.add("projects_summary");
  }

  // Bare period-only — do NOT silently default to money (clarify upstream asks for metric)
  if (
    tools.size === 0 &&
    /\b(today|yesterday|this\s+week|last\s+week|this\s+month|last\s+month|this\s+year|this\s+fy|\d{2}\s*[-–/]\s*\d{2})\b/.test(
      q
    ) &&
    !/\b(late|absent|absentee|attendance|present|sales|receipt|collection|invoice|task|leave|kpi|payment|deliver|delay|dispatch|challan|expense|stock)\b/.test(
      q
    )
  ) {
    // Leave tools empty — novaAmbiguityClarification will ask for the metric
  }

  if (isProjectValueAsk) {
    tools.delete("sales_summary");
    tools.delete("receipts_summary");
    tools.delete("search_entities");
    tools.add("projects_summary");
  }

  // Named project in utterance → never FY / biggest-project portfolio steal
  const namedProjectHint = extractNovaNamedProjectHint(query);
  if (namedProjectHint && !isProjectValueAsk) {
    tools.delete("projects_summary");
  }

  if (isDayOrWeekPeriod && !isProjectValueAsk) {
    tools.delete("projects_summary");
  }

  // Day/week + clear money metric → one primary tool (no task/workflow bleed)
  const wantsReceipts = /\b(receipts?|collections?|money\s+in)\b/.test(q);
  const wantsSales =
    /\b(sales|revenue|turnover|billed|invoiced)\b/.test(q) ||
    (/\b(invoices?|billing|gst\s+bill)\b/.test(q) && !wantsReceipts);
  if (isDayOrWeekPeriod && wantsReceipts && !/\b(and|also|plus)\b/.test(q)) {
    return {
      tools: ["receipts_summary"],
      topics: topics.filter((t) => t.id === "receipts"),
      interpretedAs: ["receipts"],
    };
  }
  if (isDayOrWeekPeriod && wantsSales && !wantsReceipts && !/\b(and|also|plus)\b/.test(q)) {
    return {
      tools: ["sales_summary"],
      topics: topics.filter((t) => t.id === "sales_invoices"),
      interpretedAs: ["billing / invoices"],
    };
  }

  // FY / year target → order book (not generic sales+receipts)
  const wantsTarget =
    /\b(order\s+book\s+target|fy\s+target|target\s+order\s+book|orderbook\s+target)\b/.test(q) ||
    (/\btargets?\b/.test(q) &&
      /\b(fy|financial\s+year|order\s+book|pipeline|\d{2}\s*[-–/]\s*\d{2}|this\s+year|this\s+fy)\b/.test(
        q
      ));
  if (wantsTarget && !wantsReceipts && !/\b(sales\s+invoice|gst\s+bill)\b/.test(q)) {
    return {
      tools: ["order_book_summary"],
      topics: topics.filter((t) => t.id === "order_book"),
      interpretedAs: ["order book / FY target"],
    };
  }

  // Clear single-metric asks → one primary tool
  if (/\b(pending\s+approvals?|my\s+approvals?|approvals?\s+pending)\b/.test(q) && !/\b(and|also|plus)\b/.test(q)) {
    return {
      tools: ["approvals_summary"],
      topics: topics.filter((t) => t.id === "approvals"),
      interpretedAs: ["approvals"],
    };
  }

  // NOVA Pulse — change facts (before generic tasks / day-activity bleed)
  if (
    /\b(what\s+changed|any\s+changes?|nova\s+pulse|pulse\s+search|recent\s+changes?|change\s+events?)\b/.test(
      q
    ) ||
    (/\b(changes?|changed)\b/.test(q) &&
      /\b(tasks?|assigned\s+by\s+me|uploads?|files?|attachments?)\b/.test(q)) ||
    (/\b(files?|attachments?|uploads?)\b/.test(q) &&
      /\b(uploaded|upload|on\s+tasks?|task)\b/.test(q)) ||
    (/\b(assigned\s+by\s+me)\b/.test(q) &&
      /\b(changes?|changed|any|files?|uploaded|pulse|activity)\b/.test(q))
  ) {
    return {
      tools: ["nova_pulse_search"],
      topics: topics.filter((t) => t.id === "nova_pulse"),
      interpretedAs: ["NOVA Pulse / what changed"],
    };
  }

  if (/\b(open\s+tasks?|overdue\s+tasks?|pending\s+tasks?|my\s+tasks?)\b/.test(q) && !/\b(and|also|plus|completed|finished)\b/.test(q)) {
    return {
      tools: ["tasks_summary"],
      topics: topics.filter((t) => t.id === "tasks"),
      interpretedAs: ["tasks"],
    };
  }
  if (
    /\b(staff|employee|employees?)\b/.test(q) &&
    /\b(advances?|advance\s+balance|settlement)\b/.test(q) &&
    !/\b(expenses?|reimburs\w*|claims?|spend|spent)\b/.test(q)
  ) {
    return {
      tools: ["staff_advances_summary"],
      topics: topics.filter((t) => t.id === "staff_advances"),
      interpretedAs: ["staff advances"],
    };
  }
  if (
    /\b(reimburs\w*|expense\s+claims?|staff\s+spend|spends?|spent|staff[-\s]?wise\s+expense|employee\s+expense|top\s+claimants?)\b/.test(
      q
    ) ||
    (/\b(staff|employee|employees?)\b/.test(q) && /\b(expenses?|kharcha|claims?|spend|spent)\b/.test(q))
  ) {
    return {
      tools: ["staff_expense_summary"],
      topics: topics.filter((t) => t.id === "staff_expenses"),
      interpretedAs: ["staff expenses / reimbursements"],
    };
  }
  if (/\b(total\s+bank\s+balance|bank\s+balance|cash\s+at\s+bank|bank\s+accounts?)\b/.test(q) && !/\b(and|also|plus|reconcil)\b/.test(q)) {
    return {
      tools: ["bank_accounts_summary"],
      topics: topics.filter((t) => t.id === "bank_accounts"),
      interpretedAs: ["bank accounts"],
    };
  }

  if (
    /\b(director\s+dashboard|finance\s+dashboard|company\s+dashboard|financial\s+overview|fy\s+overview|command\s+center|dashboard)\b/.test(
      q
    ) && !/\b(sales|receipt|invoice|task|kpi)\b/.test(q)
  ) {
    return {
      tools: ["director_dashboard_summary"],
      topics: topics.filter((t) => t.id === "finance_dashboard"),
      interpretedAs: ["director / finance dashboard"],
    };
  }

  // Role daily brief (Phase 2) — compose existing skills; not free LLM pick
  if (
    /\b(daily\s+brief|morning\s+brief|role\s+brief|director\s+brief|my\s+brief|daily\s+briefing|today'?s?\s+brief)\b/.test(q)
  ) {
    return {
      tools: ["daily_brief"],
      topics: topics.filter((t) => t.id === "daily_brief"),
      interpretedAs: ["daily brief"],
    };
  }

  // "yesterday activity" / "summarise today's activity" → day ops pack (not prior KPI)
  if (
    /\b(activit(y|ies)|day\s+summary|daily\s+summary)\b/.test(q) &&
    /\b(today|yesterday|this\s+week|last\s+week)\b/.test(q)
  ) {
    return {
      tools: ["sales_summary", "receipts_summary", "pending_workflow_counts"],
      topics: topics.filter((t) =>
        ["sales_invoices", "receipts", "pending_workflow"].includes(t.id)
      ),
      interpretedAs: ["day activity"],
    };
  }

  if (/\b(completed\s+tasks?|who\s+completed|finished\s+more\s+tasks?)\b/.test(q)) {
    return {
      tools: ["tasks_summary"],
      topics: topics.filter((t) => t.id === "tasks"),
      interpretedAs: ["tasks"],
    };
  }
  if (/\b(who\s+(?:was|is|are|were)\s+absent|absentees?|absent\s+list|absent|no\s+show|who\s+didn'?t\s+punch|who\s+did\s+not\s+punch|who\s+hasn'?t\s+punch|missing\s+punch)\b/.test(q) && !/\bleave\b/.test(q)) {
    return {
      tools: ["attendance_late_summary"],
      topics: topics.filter((t) => t.id === "attendance"),
      interpretedAs: ["attendance / absentees"],
    };
  }
  // "late yesterday" / "yesterday late" / "late today" — attendance, not sales
  // Negative: "late payment" / "late fee" stay out of attendance
  if (
    /\b(late\s*comers?|latecomers|who\s+(is|was|were)\s+late|came\s+late|late\s+minutes)\b/.test(q) ||
    (/\blate\b/.test(q) &&
      !/\b(late\s+payment|late\s+fee|late\s+charge|payment\s+late|fee|charge)\b/.test(q) &&
      !/\b(sales|revenue|receipts?|collections?|invoice|billing)\b/.test(q))
  ) {
    return {
      tools: ["attendance_late_summary"],
      topics: topics.filter((t) => t.id === "attendance"),
      interpretedAs: ["attendance / late comers"],
    };
  }
  if (/\b(who\s+was\s+present|who\s+is\s+present|present\s+list|present\s+today|attendance\s+present|did\s+\w+\s+punch|has\s+\w+\s+punch|punch(?:ed)?\s+in)\b/.test(q)) {
    return {
      tools: ["attendance_late_summary"],
      topics: topics.filter((t) => t.id === "attendance"),
      interpretedAs: ["attendance / present"],
    };
  }
  if (/\b(leave\s+balance|leave\s+status|my\s+leave|pending\s+leave|approved\s+leave|upcoming\s+leave)\b/.test(q)) {
    return {
      tools: ["leave_summary"],
      topics: topics.filter((t) => t.id === "leave"),
      interpretedAs: ["leave"],
    };
  }
  if (/\b(gstr\s*-?\s*1|gstr\s*-?\s*3b|gstr1|gstr3b|gstr)\b/.test(q)) {
    return {
      tools: ["gstr_snapshot"],
      topics: topics.filter((t) => t.id === "reports"),
      interpretedAs: ["reports"],
    };
  }
  // Bare “report / give report / save report” must not become ERP registers
  if (
    /\b(save|giv+|give|download|donwload|dl)\s+(me\s+)?(a\s+|the\s+|this\s+)?(report|reprot|raport|pdf)s?\b/.test(
      q
    ) ||
    /\b(save|download)\s+this(\s+(one|pack|answer|snapshot))?\b/.test(q)
  ) {
    return {
      tools: [],
      topics: [],
      interpretedAs: ["save nova report"],
    };
  }
  // "project wise profit" / "project profit" — not contract value (projects_summary)
  if (
    /\b(fund\s+position|profitability|project\s+p\s*&\s*l|project\s+pnl)\b/.test(q) ||
    (/\bprofits?\b/.test(q) && /\bprojects?\b/.test(q)) ||
    /\b(project[- ]?wise\s+profits?|profits?\s+(by|per|wise)\s+projects?)\b/.test(q) ||
    /\b(project\s+profit\s*\/\s*loss|projects?\s+(?:on|in|at)\s+loss|projects?\s+loss|loss[-\s]*making\s+projects?|negative\s+margin|projects?\s+margin)\b/.test(q)
  ) {
    return {
      tools: ["profitability_summary"],
      topics: topics.filter((t) => t.id === "profitability"),
      interpretedAs: ["project profitability / fund views"],
    };
  }
  if (/\b(sales\s+register|ar\s+aging|receivable\s+aging|ap\s+aging)\b/.test(q)) {
    return {
      tools: ["reports_snapshot"],
      topics: topics.filter((t) => t.id === "reports"),
      interpretedAs: ["reports"],
    };
  }
  if (
    /\b(outstanding|receivables?|pending\s+(?:payment|amount)|payment\s+pending|payment\s+receivable)\b/.test(q) &&
    /\b(customer|client|party|avaada|[a-z]{3,})\b/.test(q)
  ) {
    tools.add("customer_outstanding");
  }

  const domainHit =
    topics.length > 0 ||
    /\b(help|what can i|summary|overview|dashboard|how many|sales|revenue|pending|overdue|kpi|expense|project|month|total|task|reconcil|receivable|bank|today|receipt|late|attendance|stock|delivery|vendor|payment|customer|leave|advance|incentive|quotation|approval|employee|staff|grn|salary|tally|order book|gstr|profitability|fund)\b/.test(
      q
    );

  const looksLikeSearch = !isProjectValueAsk && q.length >= 2 && !domainHit && tools.size === 0;
  if (!isProjectValueAsk && (looksLikeSearch || tools.size === 0)) {
    tools.add("search_entities");
  }

  if (
    !isProjectValueAsk &&
    tools.size === 1 &&
    tools.has("search_entities")
  ) {
    // leave search; period enrichment happens in selectNovaTools
  }

  return {
    tools: [...tools],
    topics,
    interpretedAs: [...new Set(interpretedAs)],
  };
}

/** TOPIC_PERMISSIONS-compatible rows from lexicon (confidential + operational). */
export function lexiconTopicPermissionRows(): {
  pattern: RegExp;
  permission: Permission;
  label: string;
  anyOf?: Permission[];
  confidential?: boolean;
}[] {
  return NOVA_LEXICON.filter((t) => t.permissions.length > 0).map((t) => {
    const parts = t.synonyms
      .filter((s) => s.length >= 2)
      .map((s) => escapeRe(s.toLowerCase()).replace(/\s+/g, "\\s+"));
    const pattern = new RegExp(`\\b(?:${parts.join("|")})\\b`, "i");
    return {
      pattern,
      permission: t.permissions[0],
      anyOf: t.permissions.length > 1 ? t.permissions : undefined,
      label: t.label,
      confidential: t.confidential,
    };
  });
}

export type NovaAcronymClarify = {
  answer: string;
  links: { title: string; href: string }[];
};

/** Bare ambiguous acronyms that need a clarifying question. */
export function novaAcronymClarification(query: string): NovaAcronymClarify | null {
  const t = query.trim().toLowerCase().replace(/[?.!]+$/g, "");
  // Bare PR, or status+PR without payment/purchase cue — Indian ERP: PR is
  // often purchase indent, but payment request is also common. Clarify beats wrong bind.
  if (
    /^(pr|prs)$/i.test(t) ||
    /^(pending|open|raise|new|status)\s+prs?$/i.test(t) ||
    /^prs?\s+(pending|open|status)$/i.test(t)
  ) {
    return {
      answer:
        "Did you mean **payment requests** or **purchase requests (indents)**? Reply with one of those phrases.",
      links: [
        { title: "Payment requests", href: "/payment-requests" },
        { title: "Purchase requests", href: "/purchase-requests" },
      ],
    };
  }
  if (/^(so|sos)$/i.test(t)) {
    return {
      answer:
        "Did you mean **sales orders** (SO documents)? For project pipeline, try **new orders this month** or **projects confirmed this month**.",
      links: [
        { title: "Sales orders", href: "/sales-orders" },
        { title: "Projects", href: "/projects" },
      ],
    };
  }
  if (/^(po|pos)$/i.test(t)) {
    return {
      answer: "Did you mean **purchase orders**? Try “open purchase orders”.",
      links: [{ title: "Purchase orders", href: "/purchase-orders" }],
    };
  }
  if (/^open\s+orders$/i.test(t)) {
    return {
      answer: "Did you mean **open sales orders** or **open purchase orders**?",
      links: [
        { title: "Sales orders", href: "/sales-orders" },
        { title: "Purchase orders", href: "/purchase-orders" },
      ],
    };
  }
  // TDS liability / outstanding — no dedicated money tool; point at existing surfaces.
  if (
    /^(tds|tds_clarify|wht)$/i.test(t) ||
    /^tds\s+(outstanding|payable|os|dues|liabilit(?:y|ies))$/i.test(t) ||
    /^wht\s+(outstanding|payable|os|dues|liabilit(?:y|ies))$/i.test(t) ||
    /^withholding\s+tax(?:\s+(outstanding|payable|os|dues|liabilit(?:y|ies)))?$/i.test(t)
  ) {
    return {
      answer:
        "I don’t have a dedicated **TDS/WHT outstanding** tool. Try **purchase bills** (TDS on vendor bills), **accounts ledger**, or **vendor outstanding** for AP. For GST liability try **GST payable** / **GSTR**.",
      links: [
        { title: "Purchase bills", href: "/purchase-bills" },
        { title: "Accounts", href: "/accounts" },
        { title: "GSTR-3B", href: "/reports/gstr3b" },
      ],
    };
  }
  // TCS — collected on sales; no dedicated money tool (same clarify posture as TDS).
  if (
    /^(tcs|tcs_clarify)$/i.test(t) ||
    /^tcs\s+(outstanding|payable|os|dues|liabilit(?:y|ies))$/i.test(t)
  ) {
    return {
      answer:
        "I don’t have a dedicated **TCS outstanding** tool. Try **sales invoices** / **receipts** for collections, **accounts ledger**, or **GSTR** for GST. For vendor TDS try **TDS payable** / **purchase bills**.",
      links: [
        { title: "Sales invoices", href: "/sales-invoices" },
        { title: "Accounts", href: "/accounts" },
        { title: "GSTR-3B", href: "/reports/gstr3b" },
      ],
    };
  }
  return null;
}

/** Topics matched that have no tools yet (or empty tools) — for friendly stub answers. */
export function unmatchedTooledTopics(topics: NovaLexiconTopic[]): NovaLexiconTopic[] {
  return topics.filter((t) => t.tools.length === 0);
}

/** Period / metric / ask-verb words that must never be treated as a customer/project name. */
const ENTITY_HINT_STOP = new Set([
  "today",
  "todays",
  "yesterday",
  "yesterdays",
  "this",
  "last",
  "current",
  "my",
  "me",
  "the",
  "a",
  "an",
  "all",
  "open",
  "pending",
  "overdue",
  "total",
  "net",
  "gross",
  "biggest",
  "largest",
  "highest",
  "top",
  "active",
  "value",
  "worth",
  "recheck",
  "again",
  "confirm",
  "confirmed",
  "verify",
  "fy",
  "f.y",
  "financial",
  "calendar",
  "year",
  "month",
  "week",
  "sales",
  "revenue",
  "receipts",
  "receipt",
  "collections",
  "collection",
  "invoices",
  "invoice",
  "billing",
  "turnover",
  "delivery",
  "deliveries",
  "delay",
  "delays",
  "delayed",
  "dispatch",
  "dispatches",
  "challan",
  "challans",
  "payment",
  "payments",
  "expense",
  "expenses",
  "installation",
  "kpi",
  "attendance",
  "stock",
  "tasks",
  "task",
  "approvals",
  "approval",
  // Ask / summary verbs — "summarize sales" must not filter customerName contains "summarize"
  "summarize",
  "summarise",
  "summary",
  "summaries",
  "overview",
  "report",
  "reports",
  "finance",
  "financial",
  "numbers",
  "number",
  "how",
  "is",
  "are",
  "we",
  "doing",
  "going",
  "business",
  "company",
  "ops",
  "things",
  "performance",
  "health",
  "banking",
  "cash",
  "show",
  "list",
  "give",
  "tell",
  "get",
  "check",
  "display",
  "find",
  "fetch",
  "pull",
  "please",
  "pls",
  "just",
  "kindly",
  "about",
  "for",
  "of",
  "from",
  "by",
  "to",
  "approved",
  "uproved",
  "kiska",
  "kis",
  "ka",
  "kam",
  "hai",
  "hain",
  "ur",
  "your",
  "capabilities",
  "capability",
  "commands",
  "command",
  "features",
  "feature",
  "help",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
]);

function isNovaEntityHintNoise(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n || n.length < 2) return true;
  // Shared with parse-entity-module / acceptsPartyEntitySpan (single noise source of truth).
  if (isNovaTemporalOrModuleEntityNoise(n)) return true;
  // WH / how-is leftovers — never a party (“how is” after metric strip)
  if (/^(who|whose|what|which|when|where|why|how|kaun|kon)\b/.test(n)) return true;
  if (/\b(how(?:'s|\s+is|\s+are)|how\s+are\s+we)\b/.test(n)) return true;
  if (/^f\.?\s*y\.?\b/.test(n)) return true;
  if (/\b\d{2}\s*[-–/]\s*\d{2}\b/.test(n)) return true; // 26-27
  if (/^\d{4}$/.test(n)) return true;
  if (/^(this|last|current)(\s+(fy|year|month|week|financial\s+year))?$/.test(n)) return true;
  const tokens = n.split(/[\s/._-]+/).filter(Boolean);
  if (tokens.every((t) => ENTITY_HINT_STOP.has(t) || /^\d+$/.test(t))) return true;
  // Any stop-word token (e.g. "value biggest project") is not an entity name
  if (tokens.some((t) => ENTITY_HINT_STOP.has(t))) return true;
  if (ENTITY_HINT_STOP.has(n)) return true;
  if (/\b(projects?|receipts?|sales|invoices?|orders?)\b/.test(n)) return true;
  return false;
}

/**
 * emPOWER is project-centric: bare “new/confirmed orders” means projects confirmed
 * in the period (value / received / outstanding) — not Sales Orders documents.
 * Explicit “sales orders” / “SO” / “open orders” stay on the SO path.
 */
export function isNovaConfirmedOrdersAsk(query: string): boolean {
  const q = query.trim().toLowerCase().replace(/[?.!]+$/g, "");
  if (!q) return false;
  // Explicit Sales Order / Purchase Order documents
  if (/\bsales\s+orders?\b/.test(q) || /\bso\s+pending\b/.test(q)) return false;
  if (/\bpurchase\s+orders?\b/.test(q) || /\bopen\s+pos?\b/.test(q)) return false;
  if (/^open\s+orders$/i.test(q)) return false; // SO vs PO clarify
  if (/\border\s+book\b/.test(q) || /\borderbook\b/.test(q)) return false;

  if (/\b(new|confirmed)\s+orders?\b/.test(q)) return true;
  if (/\borders?\s+confirmed\b/.test(q)) return true;
  if (/\b(projects?\s+confirmed|confirmed\s+projects?)\b/.test(q)) return true;
  if (/\bnew\s+projects?\b/.test(q)) return true;
  // Bare “orders this month” (no sales/purchase qualifier) → confirmed projects
  if (
    /\borders?\b/.test(q) &&
    !/\b(sales|purchase|work\s+order|payment|request)\b/.test(q) &&
    /\b(this\s+month|last\s+month|this\s+week|last\s+week|this\s+fy|this\s+year|today|yesterday|january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(
      q
    )
  ) {
    return true;
  }
  return false;
}

/** Portfolio / FY project asks — not a proper named project. */
export function isNovaPortfolioProjectAsk(query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    isNovaConfirmedOrdersAsk(q) ||
    /\b(biggest|largest|highest|top)\s+projects?\b/.test(q) ||
    /\b(active|open)\s+projects?\s+(value|worth|count|list)\b/.test(q) ||
    /\bprojects?\s+(this\s+fy|value|worth|confirmed|new)\b/.test(q) ||
    /\b(project\s*value|projects?\s+value|active\s+projects?\s+value)\b/.test(q) ||
    /\bhow\s+many\s+projects?\b/.test(q) ||
    /\b(confirmed|new)\s+projects?\b/.test(q)
  );
}

const NAMED_PROJECT_PORTFOLIO_TOKEN =
  /^(biggest|largest|highest|top|active|open|this|the|a|an|our|my|every|all|new|current|fy|value|any|each|some|one|another|same|said|following|above|below|best|worst|main|other|next|last|first|confirmed|confirm)$/i;

function looksLikeNamedProjectLabel(name: string): boolean {
  // Multi-word / org tokens, or a single brand token (“Avaada project”).
  return (
    looksLikePartyOrProjectName(name) ||
    (/^[A-Za-z][A-Za-z0-9&.-]{1,40}$/.test(name.trim()) &&
      !NAMED_PROJECT_PORTFOLIO_TOKEN.test(name.trim()))
  );
}

/**
 * Proper named project in utterance — e.g. "James School project", "Avaada project".
 * Never steals portfolio asks (biggest / active value / FY).
 * Single-token brands OK when followed by the word “project” (shared label gate).
 */
export function extractNovaNamedProjectHint(query: string): string | null {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q || isNovaPortfolioProjectAsk(q)) return null;

  // Shared structure: only when utterance says “project” (not tasks-scoped place framing)
  const shared = parseEntityModuleAsk(q);
  if (
    shared?.entityKindHint === "project" &&
    (!shared.moduleHint || shared.moduleHint === "projects") &&
    /\bprojects?\b/i.test(q) &&
    shared.entitySpan &&
    looksLikeNamedProjectLabel(shared.entitySpan) &&
    !isNovaEntityHintNoise(shared.entitySpan) &&
    !NAMED_PROJECT_PORTFOLIO_TOKEN.test(shared.entitySpan)
  ) {
    return shared.entitySpan;
  }

  const accept = (raw: string | undefined | null): string | null => {
    if (!raw) return null;
    const name = parseNovaEntityRoleSpan(raw)?.entitySpan ?? raw.trim().replace(/^["']|["']$/g, "");
    if (!name || NAMED_PROJECT_PORTFOLIO_TOKEN.test(name)) return null;
    if (isNovaEntityHintNoise(name)) return null;
    if (!looksLikeNamedProjectLabel(name)) return null;
    return name;
  };

  // "at/on/for/about the James School project"
  const prep = q.match(
    /\b(?:at|on|for|about|from|of|to|in|with)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9&.\-]*(?:\s+[A-Za-z][A-Za-z0-9&.\-]*){0,4})\s+projects?\b/i
  );
  const fromPrep = accept(prep?.[1]);
  if (fromPrep) return fromPrep;

  // "James School project" / "the Avaada project" / "Avaada project"
  const bare = q.match(
    /(?:^|[,:;]|\s)(?:the\s+)?([A-Za-z][A-Za-z0-9&.\-]*(?:\s+[A-Za-z][A-Za-z0-9&.\-]*){0,4})\s+projects?\b/i
  );
  const fromBare = accept(bare?.[1]);
  if (fromBare) return fromBare;

  // "project named James School" / "project called Tata plant"
  const named = q.match(
    /\bprojects?\s+(?:named|called)\s+([A-Za-z][A-Za-z0-9&.\-]*(?:\s+[A-Za-z][A-Za-z0-9&.\-]*){0,4})/i
  );
  return accept(named?.[1]);
}

/** Extract a likely entity name filter (quoted, leading, or trailing after for/of/from). */
export function extractNovaEntityHint(query: string): string | null {
  const quoted = query.match(/["']([^"']{2,60})["']/);
  if (quoted && !isNovaEntityHintNoise(quoted[1])) return quoted[1].trim();

  const namedProject = extractNovaNamedProjectHint(query);
  if (namedProject) return namedProject;

  const metric =
    "receipts?|sales|invoices?|collections?|projects?|orders?|revenue|turnover|outstanding|receivables?";

  // "Avaada receipts today" → Avaada (not "FY 26-27 sales" / "july sales")
  const leading = query.match(
    new RegExp(
      `^([A-Za-z][A-Za-z0-9&.\\-\\s]{1,40}?)\\s+(?:${metric})\\b`,
      "i"
    )
  );
  if (leading) {
    const name = leading[1].trim();
    if (!isNovaEntityHintNoise(name)) return name;
  }

  // "receipts for Avaada" / "sales of Acme Energy" / "outstanding from Avaada"
  const trailing = query.match(
    new RegExp(
      `\\b(?:${metric})\\s+(?:for|of|from|by|to)\\s+([A-Za-z][A-Za-z0-9&.\\-\\s]{1,40}?)(?:\\s+(?:today|yesterday|this|last|in|for|fy|during)\\b|$)`,
      "i"
    )
  );
  if (trailing) {
    const name = trailing[1].trim();
    if (!isNovaEntityHintNoise(name)) return name;
  }

  // "receipts Avaada today" (bare trailing name after metric)
  const bare = query.match(
    new RegExp(
      `\\b(?:${metric})\\s+([A-Za-z][A-Za-z0-9&.\\-]{1,40}(?:\\s+[A-Za-z][A-Za-z0-9&.\\-]{1,20}){0,2})\\s*(?:today|yesterday|this\\s+month|this\\s+week|last\\s+month)?\\s*$`,
      "i"
    )
  );
  if (bare) {
    const name = bare[1].trim();
    if (!isNovaEntityHintNoise(name)) return name;
  }

  return null;
}

/**
 * Bare party / company name with no metric — e.g. "avaada", "tata steels".
 * Used for clarify + entity follow-up swap (not a silent money default).
 */
export function extractNovaBareEntityCandidate(query: string): string | null {
  const t = query.trim().replace(/\s+/g, " ");
  if (!t || t.length < 2 || t.length > 100) return null;
  if (METRIC_WORD_FOR_BARE.test(t)) return null;
  // Any matched lexicon topic (tooled or stub) is not a party name
  {
    const topics = matchNovaTopics(t);
    if (topics.length > 0) return null;
  }
  if (extractNovaEntityHint(t)) return null;
  if (extractNovaPersonHint(t)) return null;
  // 1–12 word proper-ish name (long project / legal names)
  if (!/^[A-Za-z][A-Za-z0-9&.\-]*(?:\s+[A-Za-z][A-Za-z0-9&.\-]*){0,11}$/.test(t)) {
    return null;
  }
  if (isNovaEntityHintNoise(t)) return null;
  const tokens = t.toLowerCase().split(/\s+/);
  if (tokens.some((w) => ENTITY_HINT_STOP.has(w))) return null;
  // Meta / WH / slang — never a party name (“ur capabilities”)
  if (/^(ur|your|you|u|who|what|which|how|why|when|where)\b/i.test(t)) return null;
  if (/\b(capabilities?|commands?|features?|help)\b/i.test(t)) return null;
  return t;
}

const METRIC_WORD_FOR_BARE =
  /\b(sales|revenue|receipts?|collections?|invoices?|billing|turnover|projects?|late|attendance|stock|vendors?|customers?|tasks?|kpi|approvals?|payables?|receivables?|activity|overview|summary|summaris[ee]|summarize|dashboard|order\s*book|bank|banking|cash|business|company|ops|salary|payroll|leave|advances?|incentives?|grn|profitability|pending|overdue|help|what|how|who|today|yesterday|week|month|fy|search|find|lookup|look\s*up|show|list|open|get|fetch|display|give|tell|check|for|about|deliver(?:y|ies)|delay(?:s|ed)?|dispatch(?:es|ed)?|challans?|payments?|expenses?|kharcha|installation|dc|documents?|settings?|files?|beneficiary|preferences?|quotations?|quotes?|tally|bonus|payslips?|notifications?|whatsapp|portal|automation|links?|bank\s*sms|bank\s*details|staff|employees?|pulse|changed|changes?|uploaded|upload|attachments?|purchase\s*bills?|purchase\s*orders?|credit\s*notes?|payment\s*requests?|backup|backups?|theme|appearance|audit\s*logs?|system\s+tools?|bills?)\b/i;

/** Strip prior entity names from a metric query so a new party can replace them. */
export function stripNovaEntityFromMetricQuery(metricQuery: string): string {
  let q = metricQuery.trim();
  const hint = extractNovaEntityHint(q);
  if (hint) {
    q = q.replace(new RegExp(hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ");
  }
  // Leading "for/of X" leftovers
  q = q.replace(/\b(for|of|from|by|to)\s*$/i, "");
  return q.replace(/\s+/g, " ").trim();
}

const PERSON_HINT_STOP = new Set([
  ...ENTITY_HINT_STOP,
  "pending",
  "open",
  "overdue",
  "completed",
  "finished",
  "all",
  "team",
  "staff",
  "everyone",
  "anybody",
  "someone",
  "anyone",
  "individual",
  "each",
  "every",
  "per",
  "payment",
  "payments",
  "fee",
  "charge",
  "kaun",
  "kon",
  "who",
  "whose",
  "whom",
  "what",
  "which",
  "when",
  "where",
  "why",
  "how",
  "kisne",
  "kisko",
  "me",
  "my",
  "mine",
  "our",
  "their",
  "his",
  "her",
  "them",
  // Attendance / task verbs that steal WH-phrases as “names” (“who punched late”)
  "punched",
  "punch",
  "came",
  "come",
  "was",
  "were",
  "are",
  "is",
  "did",
  "does",
  "more",
  "most",
]);

/** Interrogatives — any token matching these means the span is not a person name. */
const PERSON_HINT_WH = new Set([
  "who",
  "whose",
  "whom",
  "what",
  "which",
  "when",
  "where",
  "why",
  "how",
  "kaun",
  "kon",
  "kiska",
  "kisne",
  "kisko",
  "kis",
]);

function isNovaPersonHintNoise(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n || n.length < 2) return true;
  if (PERSON_HINT_STOP.has(n)) return true;
  const tokens = n.split(/\s+/).filter(Boolean);
  // WH-questions / stop tokens anywhere in the span ("who punched", "who completed more")
  if (tokens.some((t) => PERSON_HINT_WH.has(t) || PERSON_HINT_STOP.has(t))) return true;
  if (tokens.every((t) => /^\d+$/.test(t))) return true;
  if (
    /\b(task|tasks|kpi|leave|attendance|late|absent|present|sales|receipts?|today|yesterday|week|month|punch(?:ed)?|capabilities?|commands?|features?|help|modules?|permissions?|notifications?|whatsapp|portal|automation|links?)\b/i.test(
      n
    )
  ) {
    return true;
  }
  // Slang / possessive pronouns that steal meta asks (“ur capabilities late”)
  if (/^(ur|your|you|u)\b/.test(n)) return true;
  return false;
}

/** Up to 4 name tokens (“MD Arif Ansari”). Apostrophe allowed mid-token (O’Brien). */
const PERSON_NAME_SPAN =
  "[A-Za-z][A-Za-z'.-]{1,40}(?:\\s+[A-Za-z][A-Za-z'.-]{1,30}){0,3}";

/**
 * Name span that does not absorb a trailing possessive into the capture.
 * Use with an optional `(?:'s|’s)?` / bare-`s` group outside the capture.
 */
const PERSON_NAME_SPAN_NO_POSSESSIVE =
  "[A-Za-z][A-Za-z.-]{1,40}(?:\\s+[A-Za-z][A-Za-z.-]{1,30}){0,3}";

/** Strip possessive suffixes wrongly absorbed into a person capture. */
export function scrubNovaPersonHintCapture(raw: string): string {
  let name = raw.trim().replace(/\s+/g, " ");
  name = name.replace(/(?:'s|’s)\s*$/i, "");
  name = name.replace(/['’]\s*$/i, "");
  return name.trim();
}

/**
 * Extract a person name from task / HR / self-scoped asks
 * (“pending tasks for Zeeshan”, “MD Arif Ansari - KPI ANALYSIS”,
 * “kpi summary of Arif Ansari”, “kpi analysis for MD Arif Ansari”).
 * Hard party/project shapes never become personHint (except staff|employee prefix).
 * Multi-word personal names are allowed when a personal domain cue already matched.
 */
export function extractNovaPersonHint(query: string): string | null {
  const q = query.trim();
  if (!q) return null;

  const acceptPerson = (
    raw: string | undefined | null,
    opts?: { allowParty?: boolean; personalDomain?: boolean }
  ): string | null => {
    if (!raw || isNovaPersonHintNoise(raw)) return null;
    const name = scrubNovaPersonHintCapture(raw);
    if (!name || isNovaPersonHintNoise(name)) return null;
    if (opts?.allowParty) return name;
    if (opts?.personalDomain) {
      if (looksLikeHardPartyOrProjectName(name)) return null;
      return name;
    }
    if (looksLikePartyOrProjectName(name)) return null;
    return name;
  };

  const acceptPersonal = (raw: string | undefined | null) =>
    acceptPerson(raw, { personalDomain: true });

  const staffPrefixed = q.match(
    new RegExp(`^(?:staff|employee)\\s+(${PERSON_NAME_SPAN})\\s*$`, "i")
  );
  if (staffPrefixed) {
    return acceptPerson(staffPrefixed[1], { allowParty: true });
  }

  const whoIsPerson = q.match(
    new RegExp(
      `^(?:who\\s+(?:is|are)|who's|who\\s+was)\\s+(?:(?:the\\s+)?(?:employee|staff|person)\\s+)?(${PERSON_NAME_SPAN})\\s*$`,
      "i"
    )
  );
  if (whoIsPerson) {
    const name = whoIsPerson[1]!.trim();
    if (
      !/\b(late|absent|present|most|staff|employees?|team|people)\b/i.test(name) &&
      !/\d/.test(name) &&
      !/\b(steels?|ltd|pvt|limited|corp|industries|plant)\b/i.test(name)
    ) {
      return acceptPersonal(name);
    }
  }

  const domain =
    "tasks?|kpi|leave|attendance|work|todos?|incentives?|advances?|expenses?|reimburs\\w*|claims?|spend|spent|salary|payroll|late|absent|present|punch(?:ed)?|payment\\s+requests?|payments?";

  // “MD Arif Ansari - KPI ANALYSIS”
  const nameDashDomain = q.match(
    new RegExp(
      `^\\s*(${PERSON_NAME_SPAN})\\s*[-–—:]\\s*(?:kpi\\b|(?:analys[ei]s|analyze|analyse|summary)\\b)`,
      "i"
    )
  );
  if (nameDashDomain) {
    const hit = acceptPersonal(nameDashDomain[1]);
    if (hit) return hit;
  }

  // “kpi analysis|summary of/for Name”
  const kpiOf = q.match(
    new RegExp(
      `\\bkpi\\s+(?:analys[ei]s|analyze|analyse|summary|report(?:\\s+card)?|breakdown)\\s+(?:for|of)\\s+(${PERSON_NAME_SPAN})\\b`,
      "i"
    )
  );
  if (kpiOf) {
    const hit = acceptPersonal(kpiOf[1]);
    if (hit) return hit;
  }

  // “why is Arif kpi low”
  const whyNameKpi = q.match(
    new RegExp(`\\bwhy\\s+(?:is\\s+)?(${PERSON_NAME_SPAN})\\s+kpi\\b`, "i")
  );
  if (whyNameKpi) {
    const hit = acceptPersonal(whyNameKpi[1]);
    if (hit) return hit;
  }

  const possessive = q.match(
    new RegExp(
      `\\b(${PERSON_NAME_SPAN_NO_POSSESSIVE})(?:'s|’s)\\s+(?:${domain})\\b`,
      "i"
    )
  );
  if (possessive) {
    const hit = acceptPersonal(possessive[1]);
    if (hit) return hit;
  }

  // “which/what tasks for Arif is overdue|over due|pending” — before generic for/of
  const whichTasksFor = q.match(
    /\b(?:which|what)\s+tasks?\s+for\s+([A-Za-z][A-Za-z.-]{1,40}(?:\s+(?!is|are|was|were|over|overdue|pending|open)[A-Za-z][A-Za-z.-]{1,30}){0,3})\s+(?:is|are|was|were)?\s*(?:over\s*due|overdue|pending|open)\b/i
  );
  if (whichTasksFor) {
    const hit = acceptPersonal(whichTasksFor[1]);
    if (hit) return hit;
  }

  // “tasks for Arif is overdue|over due”
  const tasksForStatus = q.match(
    /\btasks?\s+for\s+([A-Za-z][A-Za-z.-]{1,40}(?:\s+(?!is|are|was|were|over|overdue|pending|open)[A-Za-z][A-Za-z.-]{1,30}){0,3})\s+(?:is|are|was|were)?\s*(?:over\s*due|overdue|pending|open)\b/i
  );
  if (tasksForStatus) {
    const hit = acceptPersonal(tasksForStatus[1]);
    if (hit) return hit;
  }

  // “show me Arif overdue tasks” / “give me Arif pending tasks”
  // Possessive ('s) stays outside the capture so “Arif's pending” → Arif.
  const showNameFocusTasks = q.match(
    new RegExp(
      `^(?:show|list|get|check|find|fetch|display|give(?:\\s+me)?)\\s+(?:me\\s+)?(${PERSON_NAME_SPAN_NO_POSSESSIVE})(?:'s|’s)?\\s+(?:pending|open|overdue)\\s+tasks?\\b`,
      "i"
    )
  );
  if (showNameFocusTasks) {
    const hit = acceptPersonal(showNameFocusTasks[1]);
    if (hit) return hit;
  }

  // “does Arif have overdue tasks”
  const doesHaveTasks = q.match(
    new RegExp(
      `^(?:does|did|do)\\s+(${PERSON_NAME_SPAN_NO_POSSESSIVE})\\s+have\\s+(?:any\\s+)?(?:pending|open|overdue)\\s+tasks?\\b`,
      "i"
    )
  );
  if (doesHaveTasks) {
    const hit = acceptPersonal(doesHaveTasks[1]);
    if (hit) return hit;
  }

  // Hinglish “Arif ka pending tasks” (status preferred; bare “avaada ka task” stays party)
  const hinglishPersonTasks = q.match(
    new RegExp(
      `^(${PERSON_NAME_SPAN_NO_POSSESSIVE})\\s+(?:ka|ki|ke)\\s+(?:pending|open|overdue)\\s+(?:tasks?|todos?|kaam)\\b`,
      "i"
    )
  );
  if (hinglishPersonTasks) {
    const hit = acceptPersonal(hinglishPersonTasks[1]);
    if (hit) return hit;
  }

  // Hinglish status-only: “Arif ka pending” (implies tasks; not money OS/dues)
  if (
    !/\b(approvals?|payments?|invoices?|bills?|orders?|receipts?|workflow|os|outstanding|dues)\b/i.test(
      q
    )
  ) {
    const hinglishStatusOnly = q.match(
      new RegExp(
        `^(${PERSON_NAME_SPAN_NO_POSSESSIVE})\\s+(?:ka|ki|ke)\\s+(?:pending|open|overdue)\\s*$`,
        "i"
      )
    );
    if (hinglishStatusOnly) {
      const hit = acceptPersonal(hinglishStatusOnly[1]);
      if (hit) return hit;
    }
  }

  const forOf = q.match(
    new RegExp(
      `\\b(?:${domain})\\s+(?:pending\\s+|open\\s+|overdue\\s+|analys[ei]s\\s+|analyze\\s+|analyse\\s+|summary\\s+)?(?:for|of|assigned\\s+to)\\s+(${PERSON_NAME_SPAN})\\b`,
      "i"
    )
  );
  if (forOf) {
    const raw = forOf[1]!.replace(
      /\s+(?:is|are|was|were|over\s*due|overdue|pending|open)\b.*$/i,
      ""
    ).trim();
    const hit = acceptPersonal(raw);
    if (hit) return hit;
  }

  const pendingFor = q.match(
    new RegExp(
      `\\b(?:pending|open|overdue)\\s+tasks?\\s+(?:for|of)\\s+(${PERSON_NAME_SPAN})\\b`,
      "i"
    )
  );
  if (pendingFor) {
    const hit = acceptPersonal(pendingFor[1]);
    if (hit) return hit;
  }

  // Bare “pending for Arif” / “open for Arif” (no tasks cue) — not overdue (finance).
  if (!/\b(approvals?|payments?|invoices?|bills?|orders?|receipts?|workflow)\b/i.test(q)) {
    const barePendingFor = q.match(
      new RegExp(
        `^(?:(?:show|list|get|check|find|fetch|display|give)(?:\\s+me)?\\s+)?(?:pending|open)\\s+for\\s+(${PERSON_NAME_SPAN})\\s*$`,
        "i"
      )
    );
    if (barePendingFor) {
      const hit = acceptPersonal(barePendingFor[1]);
      if (hit) return hit;
    }
  }

  // “Arif('s|s)? pending|open|overdue tasks” — possessive outside capture
  const nameThenPending = q.match(
    new RegExp(
      `\\b(${PERSON_NAME_SPAN_NO_POSSESSIVE})(?:'s|’s)?\\s+(?:pending|open|overdue)\\s+tasks?\\b`,
      "i"
    )
  );
  if (nameThenPending) {
    const hit = acceptPersonal(nameThenPending[1]);
    if (hit) return hit;
  }

  const showNameDomain = q.match(
    new RegExp(
      `\\b(?:show|list|get|check|find|fetch|display|give(?:\\s+me)?)\\s+(${PERSON_NAME_SPAN})\\s+(?:${domain})\\b`,
      "i"
    )
  );
  if (showNameDomain) {
    const hit = acceptPersonal(showNameDomain[1]);
    if (hit) return hit;
  }

  const didPersonPunch = q.match(
    new RegExp(
      `\\b(?:did|has|have)\\s+(${PERSON_NAME_SPAN})\\s+(?:punch(?:ed)?(?:\\s+in)?|come|came|show(?:ed)?\\s+up)\\b`,
      "i"
    )
  );
  if (didPersonPunch) {
    const hit = acceptPersonal(didPersonPunch[1]);
    if (hit) return hit;
  }

  // Leading name + domain (+ optional analysis/summary)
  const leadingNameDomain = q.match(
    new RegExp(
      `^\\s*(${PERSON_NAME_SPAN})\\s+(?:${domain})(?:\\s+(?:analys[ei]s|analyze|analyse|summary))?\\b`,
      "i"
    )
  );
  if (leadingNameDomain) {
    const hit = acceptPersonal(leadingNameDomain[1]);
    if (hit) return hit;
  }

  const wasPersonStatus = q.match(
    new RegExp(
      `\\b(?:was|is|were|are)\\s+(${PERSON_NAME_SPAN})\\s+(?:present|absent|late|on\\s+leave)\\b`,
      "i"
    )
  );
  if (wasPersonStatus) {
    const hit = acceptPersonal(wasPersonStatus[1]);
    if (hit) return hit;
  }

  return null;
}
