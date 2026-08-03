/**
 * Light language meta-intents for NOVA (ability + preference).
 * Deterministic — must run before entity search / empty help.
 */

export type NovaLanguageMetaKind = "language" | "lang_prefer";

export type NovaLanguageFocus = "hindi" | "hinglish" | "english" | "tamil" | "general";

const LANG =
  "(hindi|hinglish|english|tamil|हिंदी|हिन्दी|अंग्रेजी|தமிழ்)";

/** Normalize like chitchat: trim, lower, strip trailing punct / assistant name. */
function coreQuery(query: string): string {
  const raw = query.trim().toLowerCase();
  if (!raw || raw.length > 160) return "";
  return raw
    .replace(/[!?.,…]+$/g, "")
    .replace(/\b(nova(\s*ai)?|assistant)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectNovaLanguageFocus(query: string): NovaLanguageFocus {
  const t = query.trim().toLowerCase();
  if (/[\u0B80-\u0BFF]/.test(query) || /\btamil\b|தமிழ்/.test(t)) return "tamil";
  if (/\bhinglish\b/.test(t)) return "hinglish";
  if (/\bhindi\b/.test(t) || /हिंदी|हिन्दी/.test(query)) return "hindi";
  if (/\benglish\b/.test(t) || /अंग्रेजी/.test(query)) return "english";
  return "general";
}

/**
 * Prefer Hindi/Hinglish reply tone for language meta (not just greeting markers).
 * English asks like "do you speak hindi" stay English; preference/Hinglish asks go Hindi-side.
 */
export function prefersLanguageMetaHinglish(
  rawQuery: string,
  kind: NovaLanguageMetaKind
): boolean {
  const t = rawQuery.trim();
  if (!t) return false;
  if (/[\u0900-\u097F]/.test(t)) return true;
  const lower = t.toLowerCase();
  if (
    /\b(aapko|tumhe|tujhe|aap\s+ko|mein\s+baat|baat\s+karo|baat\s+kariye|aata\s+hai|aati\s+hai|aate\s+hai|bolte\s+ho|bolti\s+ho|samajhte|samajhti|jaante|jaanti)\b/.test(
      lower
    )
  ) {
    return true;
  }
  if (kind === "lang_prefer" && /\b(hindi|hinglish)\b/.test(lower)) return true;
  if (/\bhinglish\b/.test(lower) && /\b(talk|speak|chat|reply|baat|understand)\b/.test(lower)) {
    return true;
  }
  return false;
}

/** Detect language-ability or language-preference intents (before search). */
export function detectNovaLanguageMeta(query: string): NovaLanguageMetaKind | null {
  const core = coreQuery(query);
  if (!core) return null;

  // "can/do you talk in hindi" is ability; "talk to me in hindi" is preference
  const isCanDoAsk = /\b(do\s+you|can\s+you|could\s+you|are\s+you\s+able\s+to)\b/.test(core);

  // Preference — "talk to me in hindi" / "hindi mein baat karo"
  if (
    !isCanDoAsk &&
    (new RegExp(
      `\\b((talk|speak|chat|reply|answer|respond)(\\s+to\\s+me)?\\s+in\\s+${LANG}|` +
        `switch\\s+to\\s+${LANG}|` +
        `use\\s+${LANG}|` +
        `(please\\s+)?(talk|speak|reply)\\s+${LANG})\\b`
    ).test(core) ||
      new RegExp(
        `(${LANG})\\s+mein\\s+baat(\\s+(karo|kariye|karna|karein|kare))?|` +
          `baat\\s+(karo|kariye|karna)?\\s*(${LANG})\\s+mein|` +
          `(${LANG})\\s+mein\\s+(bolo|boliye|likho)|` +
          `\\b(hindi|hinglish)\\s+mein\\b`
      ).test(core) ||
      /(हिंदी|हिन्दी)\s*में\s*(बात|बोल)/.test(query) ||
      /बात\s*(करो|करिए|कीजिए).*?(हिंदी|हिन्दी)/.test(query))
  ) {
    return "lang_prefer";
  }

  // Ability: do you speak / can you talk in / aapko hindi aata hai / …
  if (
    new RegExp(
      `\\b((do\\s+you|can\\s+you|could\\s+you|are\\s+you\\s+able\\s+to)\\s+` +
        `(speak|talk|understand|reply|chat|write)(\\s+in)?\\s+${LANG}|` +
        `(do\\s+you\\s+know|know\\s+any)\\s+${LANG}|` +
        `speak\\s+${LANG}\\??$)`
    ).test(core) ||
    new RegExp(
      `\\b(kya\\s+)?(aapko|tumhe|tujhe|aap\\s+ko)\\s+${LANG}\\s+(aata|aati|aate)(\\s+hai)?\\b`
    ).test(core) ||
    new RegExp(
      `\\b(kya\\s+)?(aap|tum|tu)\\s+${LANG}\\s+(bolte|bolti|samajhte|samajhti|jaante|jaanti|samajh)(\\s+(ho|hai|sakte|sakti))?\\b`
    ).test(core) ||
    new RegExp(`\\b${LANG}\\s+(aata|aati|aate)(\\s+hai)?\\b`).test(core) ||
    /क्या\s*(आपको|तुम्हें|तुझे)?\s*(हिंदी|हिन्दी|अंग्रेजी)/.test(query) ||
    /(आपको|तुम्हें)\s*(हिंदी|हिन्दी)\s*आत[ीि]/.test(query) ||
    /(हिंदी|हिन्दी)\s*आत[ीि]\s*है/.test(query) ||
    /\b(fluent\s+in|fluency\s+in)\s+(hindi|hinglish|english|tamil)\b/.test(core)
  ) {
    return "language";
  }

  return null;
}

export function novaLanguageMetaOpener(
  first: string,
  kind: NovaLanguageMetaKind,
  rawQuery: string
): string {
  const focus = detectNovaLanguageFocus(rawQuery);
  const hinglish = prefersLanguageMetaHinglish(rawQuery, kind);

  if (kind === "lang_prefer") {
    if (focus === "english") {
      return hinglish
        ? `Theek hai, ${first} — English mein continue karte hain. ERP numbers exact rahenge.`
        : `Sure, ${first} — I’ll stick to English. ERP numbers stay exact.`;
    }
    if (focus === "tamil") {
      return hinglish
        ? `Try karta hoon thoda Tamil mein, ${first} — lekin English / Hindi-Hinglish mein zyada clear hoon. Numbers hamesha exact.`
        : `I can try a little Tamil, ${first}, but I’m clearest in English or Hindi/Hinglish — and I’ll keep ERP numbers exact.`;
    }
    // hindi / hinglish / general preference → warm Hindi-side ack
    return `Theek hai, ${first} — ab Hindi/Hinglish mein baat karte hain. ERP ke figures exact rahenge. Jo chahiye poochho.`;
  }

  // Ability
  if (focus === "tamil") {
    return hinglish
      ? `Thoda Tamil try kar sakta hoon, ${first} — strongest English aur Hindi/Hinglish mein hoon. Numbers exact rakhunga.`
      : `I can try a little Tamil, ${first}, but I’m strongest in English and Hindi/Hinglish — and I’ll keep ERP numbers exact either way.`;
  }
  if (focus === "english") {
    return hinglish
      ? `Haan ${first} — English default hai clear ERP answers ke liye. Hindi/Hinglish bhi theek hai jab aap usi mein likho.`
      : `Yes ${first} — English is my default for clear ERP answers. Hindi/Hinglish works too when you write that way.`;
  }
  if (focus === "hinglish" || (focus === "hindi" && hinglish) || hinglish) {
    return `Haan ${first} — Hindi aur Hinglish samajh sakta hoon aur usi style mein jawab de sakta hoon. ERP numbers exact rahenge. Hindi mein continue karein?`;
  }
  // English ask about Hindi (e.g. "do you speak hindi")
  if (focus === "hindi") {
    return `Yes ${first} — I can understand and reply in Hindi or Hinglish. I’ll keep ERP numbers exact. Want to continue in Hindi?`;
  }
  return hinglish
    ? `Haan ${first} — English, Hindi, aur Hinglish samajh sakta hoon. Numbers exact; thodi language mix chal sakti hai.`
    : `Yes ${first} — I can follow English, Hindi, and Hinglish. I’ll keep ERP numbers exact; phrasing may be a little mixed, and that’s okay.`;
}
