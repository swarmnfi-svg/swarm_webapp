/**
 * Light query normalization for NOVA (typos / shorthand + lexicon synonyms).
 * Read-only assistant — never used to mutate data.
 */
import { expandNovaLexicon } from "@/lib/ai/nova-lexicon";
import { normalizeNovaDocumentJargon } from "@/lib/nova/nlp-document-jargon";

const WORD_FIXES: [RegExp, string][] = [
  [/\bslaes\b/gi, "sales"],
  [/\bsalees\b/gi, "sales"],
  [/\breveneue\b/gi, "revenue"],
  [/\breveneu\b/gi, "revenue"],
  [/\binvoics?\b/gi, "invoices"],
  [/\breciepts?\b/gi, "receipts"],
  [/\breceits?\b/gi, "receipts"],
  [/\bcolle[cs]tions?\b/gi, "collections"],
  [/\bpendng\b/gi, "pending"],
  [/\boverude\b/gi, "overdue"],
  [/\bprojets?\b/gi, "projects"],
  [/\bexpenes?\b/gi, "expense"],
  [/\bexpences?\b/gi, "expense"],
  [/\bkpis?\b/gi, "kpi"],
  [/\bstaf\b/gi, "staff"],
  [/\bbigest\b/gi, "biggest"],
  [/\blarges\b/gi, "largest"],
  [/\bcommers\b/gi, "comers"],
  [/\bcome?rs\b/gi, "comers"],
  [/\blatecomers\b/gi, "late comers"],
  [/\blate\s*commers\b/gi, "late comers"],
  [/\battandance\b/gi, "attendance"],
  [/\batendance\b/gi, "attendance"],
  [/\bpuch\b/gi, "punch"],
  [/\bdelivry\b/gi, "delivery"],
  [/\bstok\b/gi, "stock"],
  [/\buproved\b/gi, "approved"],
  [/\bapprovd\b/gi, "approved"],
  [/\bkharcha\b/gi, "expenses"],
  [/\bkharche\b/gi, "expenses"],
  [/\bsalry\b/gi, "salary"],
  [/\bsalery\b/gi, "salary"],
  [/\bsalarie\b/gi, "salary"],
  [/\btaks\b/gi, "tasks"],
  [/\bsumary\b/gi, "summary"],
  [/\bsummry\b/gi, "summary"],
  [/\bpament\b/gi, "payment"],
  [/\bpaymnet\b/gi, "payment"],
  [/\bpayement\b/gi, "payment"],
  [/\bpaymrnt\b/gi, "payment"],
  [/\bpaymnt\b/gi, "payment"],
  [/\bpaymet\b/gi, "payment"],
  [/\bpaymrent\b/gi, "payment"],
  [/\bregularize\b/gi, "regularisation"],
  [/\bregularization\b/gi, "regularisation"],
  [/\bregularise\b/gi, "regularisation"],
  [/\boutstandng\b/gi, "outstanding"],
  [/\boutsatnding\b/gi, "outstanding"],
  [/\bleder\b/gi, "ledger"],
  [/\bpuchase\b/gi, "purchase"],
];

/**
 * Light Devanagari → English tokens (common ERP asks).
 * Applied before Latin Hinglish so mixed scripts still route.
 */
const DEVANAGARI_PHRASES: [RegExp, string][] = [
  [/आज/g, "today"],
  [/कल/g, "yesterday"],
  [/परसों|परसो/g, "day before yesterday"],
  [/इस\s*महीने|इस\s*महीना/g, "this month"],
  [/पिछले\s*महीने|पिछला\s*महीना/g, "last month"],
  [/अगले\s*हफ्ते|अगले\s*सप्ताह/g, "next week"],
  [/इस\s*हफ्ते|इस\s*सप्ताह/g, "this week"],
  [/बिक्री|सेल्स/g, "sales"],
  [/रसीद|कलेक्शन|संग्रह/g, "receipts"],
  [/छुट्टी|अवकाश/g, "leave"],
  [/हाजिरी|उपस्थिति/g, "attendance"],
  [/अनुपस्थित/g, "absent"],
  [/उपस्थित/g, "present"],
  [/मेरी\s*छुट्टी/g, "my leave"],
  [/बैलेंस|शेष/g, "balance"],
];

/**
 * Hinglish / Indian-English period + money phrases → English tokens
 * so date parsing and lexicon routing stay accurate (aaj ≠ this month).
 */
const HINGLISH_PHRASES: [RegExp, string][] = [
  // Periods (longer phrases first)
  [/\b(is|iss|es)\s+(mahine|mahina|maheene|month)\b/gi, "this month"],
  [/\b(pichle|pichhla|pichhli|peechle|previous)\s+(mahine|mahina|maheene|month)\b/gi, "last month"],
  [/\b(agle|agla|agli|next)\s+(mahine|mahina|maheene|month)\b/gi, "next month"],
  [/\b(is|iss)\s+(hafte|hafta|week)\b/gi, "this week"],
  [/\b(pichle|pichhla|peechle)\s+(hafte|hafta|week)\b/gi, "last week"],
  [/\b(agle|agla|agli|next)\s+(hafte|hafta|week)\b/gi, "next week"],
  [/\b(is|iss)\s+(saal|sal|fy|financial\s+year)\b/gi, "this fy"],
  [/\b(pichle|pichhla)\s+(saal|sal|fy)\b/gi, "last year"],
  [/\baaj(?:\s+(?:ke|ki|ka))?\b/gi, "today"],
  [/\bkal(?:\s+(?:ke|ki|ka))?\b/gi, "yesterday"],
  [/\bparso(?:\s+(?:ke|ki|ka))?\b/gi, "day before yesterday"],
  [/\bpars[oó]n?\b/gi, "day before yesterday"],
  // Money / collections phrasing
  [/\b(pais[ae]|paise|rupaye?|rupees?)\s+(aaya|aaye|aayi|aya|aye|mila|mile|mili)\b/gi, "receipts"],
  [/\b(collection|collections|receipts?)\s+(aaya|aaye|aayi|aya|aye|mila|mile)\b/gi, "receipts"],
  [/\bmoney\s+(aaya|aaye|in)\b/gi, "receipts"],
  // Outstanding / dues (before bare “paisa” can steal to receipts)
  [/\budhaars?\b/gi, "outstanding"],
  [/\b(?:baki|baaki)\s+(?:pais[ae]|paise|amount|hai|hain)\b/gi, "outstanding"],
  [/\b(?:kitn[aei]\s+)?(?:baki|baaki)\b/gi, "outstanding"],
  [/\bkitn[aei]\s+(sales|revenue|billing|turnover|collection|collections|receipts?|outstanding|udhaar)\b/gi, "$1"],
  [/\b(sales|revenue|billing|turnover|collection|collections|receipts?)\s+kitn[aei]\b/gi, "$1"],
  // Business / people Hinglish
  [/\b(meri|mera|mere)\s+(chutti|chhutti|leave)\b/gi, "my leave"],
  [/\b(leave|chutti|chhutti)\s+(balance|bal|baki|baaki)\b/gi, "leave balance"],
  [/\b(chutti|chhutti)\b/gi, "leave"],
  [/\b(kaun|kon)\s+(absent|gayab)\b/gi, "who was absent"],
  // Match "kon late aaya" before bare "kon … aaya" / "late aaya" to avoid
  // "who was late aaya" → "who was late comers" → lexicon "late comers comers".
  [/\b(kaun|kon)\s+late(?:\s+(?:aaya|aaye|aayi|aya|aye))?\b/gi, "who was late"],
  [/\b(kaun|kon)\s+(der\s+se)\b/gi, "who was late"],
  [/\b(kaun|kon)\s+(present|aaya|aaye)\b/gi, "who was present"],
  [/\b(der\s+se\s+(aaya|aaye|aayi|aya|aye)|late\s+(aaya|aaye|aayi|aya|aye)|der\s+se)\b/gi, "late comers"],
  [/\bgayab\b/gi, "absent"],
  [/\bhaziri\b/gi, "attendance"],
  [/\bmera\s+kpi\b/gi, "my kpi"],
  [/\bkiska\s+kpi\s+(kam|zyada|jyada)\s*(hai)?\b/gi, "kpi"],
  [/\bkiska\s+kpi\b/gi, "kpi"],
  [/\bkis\s+ka\s+kpi\b/gi, "kpi"],
  [/\bkpi\s+kam\b/gi, "kpi"],
  [/\bkpi\s+(zyada|jyada|best|worst|accha|bekaar)\b/gi, "kpi"],
  [/\b(kam|zyada|jyada)\s+kpi\b/gi, "kpi"],
  [/\bmeri\s+attendance\b/gi, "my attendance"],
  [/\bkharcha\b/gi, "expenses"],
  [/\bkharche\b/gi, "expenses"],
  [/\b(commision|kommission)\b/gi, "commission"],
];

/** Soft filler verbs that should not block routing. */
const HINGLISH_FILLERS: [RegExp, string][] = [
  [/\b(batao|bata|bataao|dikhao|dikha|dikhaao|bolo|please\s+batao)\b/gi, ""],
  [/\bkitn[aei]\b/gi, ""],
];

/** Normalize typos and common shorthand before intent/tool routing. */
export function normalizeNovaQuery(raw: string): string {
  let q = raw.trim().replace(/\s+/g, " ");
  if (!q) return q;

  for (const [re, rep] of DEVANAGARI_PHRASES) {
    q = q.replace(re, rep);
  }

  // today / yesterday typos (before possessive forms)
  // Common fat-finger / swap: todyas, todys, toady, tdaya, todsy, tday, …
  q = q.replace(
    /\b(todyas|todys|toady|todaya|tday|todsy|tdaya|tdya|toyas|todai|todat|tdoay|tdoy|todya|todqy|tooday)\b/gi,
    "today"
  );
  q = q.replace(
    /\b(yesteday|yestarday|yesterdy|yesterda|yeserday|yesturday|yestoday|yestrday|yeasterday)\b/gi,
    "yesterday"
  );

  // today / todays / today's
  q = q.replace(/\btoday'?s\b/gi, "today");
  q = q.replace(/\btodays\b/gi, "today");
  q = q.replace(/\byesterday'?s\b/gi, "yesterday");
  q = q.replace(/\byesterdays\b/gi, "yesterday");

  // "tis month" / "dis month" / "thismonth" → this month
  q = q.replace(/\b(t+is|dis|ths|thsi)\s*month\b/gi, "this month");
  q = q.replace(/\bthismonth\b/gi, "this month");
  q = q.replace(/\blastmonth\b/gi, "last month");
  q = q.replace(/\b(t+is|dis)\s*year\b/gi, "this year");

  // “pending tasks i this project” / “invoices i that customer” → in this/that …
  q = q.replace(/\b([i1l|])\s+(this|that|the)\s+(project|customer|vendor|party)\b/gi, "in $2 $3");
  q = q.replace(/\bin\s+tis\s+(project|customer|vendor)\b/gi, "in this $1");
  q = q.replace(/\bthsi\s+(project|customer|vendor)\b/gi, "this $1");

  for (const [re, rep] of HINGLISH_PHRASES) {
    q = q.replace(re, rep);
  }
  for (const [re, rep] of HINGLISH_FILLERS) {
    q = q.replace(re, rep);
  }
  q = q.replace(/\s+/g, " ").trim();

  // Phase G — pin before WORD_FIXES turns "collection" → "collections" → receipts.
  q = q.replace(
    /\bcollections?\s+delay(?:\s+estimate)?\b/gi,
    "collection_delay_estimate"
  );
  q = q.replace(
    /\bpayment\s+delay\s+(?:estimate|prediction)\b/gi,
    "collection_delay_estimate"
  );
  q = q.replace(/\bcollection\s+prediction\b/gi, "collection_delay_estimate");
  q = q.replace(/\bwhen\s+will\s+they\s+pay\b/gi, "collection_delay_estimate");

  for (const [re, rep] of WORD_FIXES) {
    q = q.replace(re, rep);
  }

  // Engineering drawing / file jargon → documents (P&ID, GA, SLD, …)
  q = normalizeNovaDocumentJargon(q);

  // Synonym / acronym expansion (collections→receipts, AR→receivables, …)
  q = expandNovaLexicon(q);

  return q;
}
