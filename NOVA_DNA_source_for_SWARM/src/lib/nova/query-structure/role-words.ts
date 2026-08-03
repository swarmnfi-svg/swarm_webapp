/**
 * Shared role / module noun lists — Eng / Hinglish.
 * Never treat these as part of a legal party/project name.
 */

/** Trailing / embedded role nouns that are never part of the legal name. */
export const NOVA_ENTITY_ROLE_WORDS =
  /^(?:projects?|tasks?|todos?|jobs?|works?|kaam|invoices?|billing|receipts?|collections?|orders?|customers?|vendors?|staff|employees?|deliver(?:y|ies|ed)?|dispatch(?:es|ed)?|ship(?:ped)?|install(?:ation|ations|ed|ing)?|technicians?|details?|info(?:rmation)?|ledgers?|outstanding|indents?|grns?|sos?|pos?|prs?)$/i;

export const NOVA_MODULE_ROLE_WORDS = {
  tasks: /^(?:tasks?|todos?|kaam)$/i,
  invoices: /^(?:invoices?|billing|sales)$/i,
  receipts: /^(?:receipts?|collections?)$/i,
  projects: /^(?:projects?)$/i,
  sales_orders: /^(?:orders?|sos?)$/i,
  purchase_orders: /^(?:pos?)$/i,
  purchase_requests: /^(?:prs?|indents?)$/i,
  documents: /^(?:documents?|photos?|files?)$/i,
  approvals: /^(?:approvals?)$/i,
  delivery: /^(?:deliver(?:y|ies|ed)?|dispatch(?:es|ed)?|ship(?:ped)?|install(?:ation|ations|ed|ing)?|technicians?)$/i,
  grn: /^(?:grns?|mrns?)$/i,
  expenses: /^(?:expenses?|kharcha)$/i,
  ledger: /^(?:ledgers?)$/i,
  outstanding: /^(?:outstanding|os)$/i,
} as const;

/** Hinglish possessives / fillers between party and module (“Avaada ka task”). */
export const NOVA_HINGLISH_LINKER =
  /^(?:ka|ki|ke|mein|me|par|pe|wala|wali|wale)$/i;

/**
 * Depth cues — thin skill vs pack vs Analysis vs Trend.
 * Order of precedence is applied in `pickNovaQueryDepth`.
 */
export const NOVA_DEPTH_ANALYSIS_CUE =
  /\b(why|explain|analys[ei]s|analyze|analyse|kyun|kyu)\b/i;
export const NOVA_DEPTH_TREND_CUE =
  /\b(trends?|over\s+time|frequently|frequent|always|often|most\s+often|repeated(?:ly)?)\b/i;
export const NOVA_DEPTH_PACK_CUE =
  /\b(everything|deep\s*dive|full\s+(?:picture|status|overview)|project\s+command|collection\s+attention|month\s+performance|cash\s+and\s+banking|photos?|pictures?|images?)\b/i;
