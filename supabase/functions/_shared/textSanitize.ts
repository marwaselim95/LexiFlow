// supabase/functions/_shared/textSanitize.ts
// ────────────────────────────────────────────────────────────────────────────
// Post-processing helper that **detects** (but does not patch) LLM-generated
// text where characters from one Unicode script are accidentally mixed into a
// word that should be entirely in another script.
//
// Example: Arabic "متبادل" (mutual) returning as "متبadel" — Latin characters
// injected mid-word by the underlying LLM.
//
// This module is deliberately provider-agnostic and never touches gemini.ts,
// prompt text, model choice, or API keys.
// ────────────────────────────────────────────────────────────────────────────

// ── Script ranges ───────────────────────────────────────────────────────────
// Each entry maps a human-readable script name to an array of [start, end]
// code-point ranges (inclusive). Add new scripts by appending entries here.

export type ScriptName = "arabic" | "latin" | "cjk" | "cyrillic";

const SCRIPT_RANGES: Record<ScriptName, [number, number][]> = {
  arabic: [
    [0x0600, 0x06ff], // Arabic
    [0x0750, 0x077f], // Arabic Supplement
    [0x08a0, 0x08ff], // Arabic Extended-A
    [0xfb50, 0xfdff], // Arabic Presentation Forms-A
    [0xfe70, 0xfeff], // Arabic Presentation Forms-B
  ],
  latin: [
    [0x0041, 0x005a], // A-Z
    [0x0061, 0x007a], // a-z
    [0x00c0, 0x00ff], // Latin-1 Supplement (À-ÿ)
    [0x0100, 0x024f], // Latin Extended-A + B
    [0x1e00, 0x1eff], // Latin Extended Additional
  ],
  cjk: [
    [0x4e00, 0x9fff],   // CJK Unified Ideographs
    [0x3400, 0x4dbf],   // CJK Extension A
    [0x20000, 0x2a6df], // CJK Extension B
    [0x2a700, 0x2b73f], // CJK Extension C
    [0x2b740, 0x2b81f], // CJK Extension D
    [0x3000, 0x303f],   // CJK Symbols
    [0x3040, 0x309f],   // Hiragana (for Japanese)
    [0x30a0, 0x30ff],   // Katakana
    [0xff00, 0xffef],   // Full-width Latin / Half-width Katakana
  ],
  cyrillic: [
    [0x0400, 0x04ff], // Cyrillic
    [0x0500, 0x052f], // Cyrillic Supplement
    [0x2de0, 0x2dff], // Cyrillic Extended-A
    [0xa640, 0xa69f], // Cyrillic Extended-B
  ],
};

// Characters we always ignore when checking for contamination:
// digits, whitespace, common punctuation, markdown bold (**), middle-dot,
// hyphens, quotes, parentheses, brackets, etc.
const IGNORABLE_RE =
  /^[\d\s\p{P}\p{S}\u200c\u200d\u00b7\ufeff\u200b*]+$/u;

// ── Core detection ──────────────────────────────────────────────────────────

function codePointBelongsTo(cp: number, script: ScriptName): boolean {
  return SCRIPT_RANGES[script].some(([lo, hi]) => cp >= lo && cp <= hi);
}

function isIgnorable(char: string): boolean {
  return IGNORABLE_RE.test(char);
}

/**
 * Returns `true` if `word` (a single token, no spaces) contains characters
 * from a Unicode script block that is clearly different from `expectedScript`.
 *
 * Digits, whitespace, and common punctuation / markdown are ignored — those
 * aren't contamination.
 *
 * @example
 *   isScriptContaminated("متبادل", "arabic")   // false — pure Arabic
 *   isScriptContaminated("متبadel", "arabic")   // true  — Latin mixed in
 *   isScriptContaminated("hello",   "latin")    // false — pure Latin
 */
export function isScriptContaminated(
  word: string,
  expectedScript: ScriptName
): boolean {
  for (const char of word) {
    if (isIgnorable(char)) continue;

    const cp = char.codePointAt(0)!;

    // If it belongs to the expected script, it's fine
    if (codePointBelongsTo(cp, expectedScript)) continue;

    // If it belongs to ANY other known script, that's contamination
    for (const [otherScript, ranges] of Object.entries(SCRIPT_RANGES)) {
      if (otherScript === expectedScript) continue;
      if (ranges.some(([lo, hi]: [number, number]) => cp >= lo && cp <= hi)) {
        return true; // contamination detected
      }
    }

    // Unknown script (e.g. Thai, Devanagari) — don't flag, we have no
    // opinion on scripts we haven't registered.
  }
  return false;
}

// ── Language → Script mapping ───────────────────────────────────────────────

const LANG_TO_SCRIPT: Record<string, ScriptName> = {
  // Arabic-script languages
  arabic: "arabic",
  persian: "arabic",
  farsi: "arabic",
  urdu: "arabic",
  pashto: "arabic",
  kurdish: "arabic",

  // Latin-script languages
  english: "latin",
  spanish: "latin",
  french: "latin",
  german: "latin",
  italian: "latin",
  portuguese: "latin",
  dutch: "latin",
  swedish: "latin",
  norwegian: "latin",
  danish: "latin",
  finnish: "latin",
  polish: "latin",
  czech: "latin",
  romanian: "latin",
  turkish: "latin",
  vietnamese: "latin",
  indonesian: "latin",
  malay: "latin",
  tagalog: "latin",
  swahili: "latin",
  catalan: "latin",
  hungarian: "latin",
  croatian: "latin",

  // CJK
  chinese: "cjk",
  "mandarin chinese": "cjk",
  mandarin: "cjk",
  cantonese: "cjk",
  japanese: "cjk",
  korean: "cjk",

  // Cyrillic
  russian: "cyrillic",
  ukrainian: "cyrillic",
  bulgarian: "cyrillic",
  serbian: "cyrillic",
  belarusian: "cyrillic",
  macedonian: "cyrillic",
};

/**
 * Maps a human-readable language name (e.g. "Arabic", "Mandarin Chinese",
 * "Spanish") to a `ScriptName`.
 *
 * Returns `null` for languages we can't confidently map — in that case the
 * caller should skip validation entirely rather than guessing.
 */
export function deriveExpectedScript(langName: string): ScriptName | null {
  const key = langName.trim().toLowerCase();
  return LANG_TO_SCRIPT[key] ?? null;
}

// ── Field-level helpers for edge functions ──────────────────────────────────

interface ContaminationResult {
  headwordContaminated: boolean;
  filteredSynonyms: string[];
  filteredContexts: Array<Record<string, unknown>>;
  /** Number of synonyms removed */
  synonymsRemoved: number;
  /** Number of context blocks removed */
  contextsRemoved: number;
}

/**
 * Splits `text` into words and returns `true` if ANY word is contaminated.
 */
function textIsContaminated(text: string, script: ScriptName): boolean {
  const words = String(text).split(/\s+/).filter(Boolean);
  return words.some((w) => isScriptContaminated(w, script));
}

/**
 * Validate a parsed detail card, filtering contaminated fields.
 *
 * @param card       The parsed card object from the LLM
 * @param nativeLang Human-readable native language name (for synonyms)
 * @param targetLang Human-readable target language name (for headword/contexts)
 * @param fnLabel    Label for logging (e.g. "generateDetailCard", "searchExplore")
 */
export function validateCardScripts(
  card: Record<string, unknown>,
  nativeLang: string,
  targetLang: string,
  fnLabel: string
): ContaminationResult {
  const nativeScript = deriveExpectedScript(nativeLang);
  const targetScript = deriveExpectedScript(targetLang);

  const result: ContaminationResult = {
    headwordContaminated: false,
    filteredSynonyms: [],
    filteredContexts: [],
    synonymsRemoved: 0,
    contextsRemoved: 0,
  };

  // ── Headword (targetLang script) ────────────────────────────────────────
  if (targetScript && typeof card.headword === "string") {
    if (textIsContaminated(card.headword, targetScript)) {
      console.warn(
        `[${fnLabel}] SCRIPT_CONTAMINATION headword="${card.headword}" ` +
        `targetLang="${targetLang}" expectedScript="${targetScript}"`
      );
      result.headwordContaminated = true;
      // Caller should abort the whole card
      return result;
    }
  }

  // ── Synonyms (nativeLang script) ────────────────────────────────────────
  const rawSynonyms = Array.isArray(card.synonyms)
    ? (card.synonyms as string[])
    : [];

  if (nativeScript) {
    result.filteredSynonyms = rawSynonyms.filter((syn) => {
      const contaminated = textIsContaminated(syn, nativeScript);
      if (contaminated) {
        console.warn(
          `[${fnLabel}] SCRIPT_CONTAMINATION field="synonyms" ` +
          `value="${syn}" nativeLang="${nativeLang}" expectedScript="${nativeScript}"`
        );
        result.synonymsRemoved++;
      }
      return !contaminated;
    });
  } else {
    // Can't validate — pass through unchanged
    result.filteredSynonyms = rawSynonyms;
  }

  // ── Contexts (targetLang script for label/explanation/example) ──────────
  const rawContexts = Array.isArray(card.contexts)
    ? (card.contexts as Array<Record<string, unknown>>)
    : [];

  if (targetScript) {
    result.filteredContexts = rawContexts.filter((ctx) => {
      for (const field of ["label", "explanation", "example"] as const) {
        const value = ctx[field];
        if (typeof value === "string" && textIsContaminated(value, targetScript)) {
          console.warn(
            `[${fnLabel}] SCRIPT_CONTAMINATION field="contexts.${field}" ` +
            `value="${value}" targetLang="${targetLang}" expectedScript="${targetScript}"`
          );
          result.contextsRemoved++;
          return false; // drop the entire context block
        }
      }
      return true;
    });
  } else {
    result.filteredContexts = rawContexts;
  }

  return result;
}

// ── Inline tests (Deno) ─────────────────────────────────────────────────────
// Run with: deno test supabase/functions/_shared/textSanitize.ts

if (typeof Deno !== "undefined" && typeof (Deno as any).test === "function") {
  const { assertEquals } = await import(
    "https://deno.land/std@0.168.0/testing/asserts.ts"
  );

  Deno.test("pure Arabic word is NOT contaminated", () => {
    assertEquals(isScriptContaminated("متبادل", "arabic"), false);
  });

  Deno.test("Arabic word with Latin injection IS contaminated", () => {
    // "متبadel" — Latin letters mixed into Arabic
    assertEquals(isScriptContaminated("متبadel", "arabic"), true);
  });

  Deno.test("Arabic word with CJK injection IS contaminated", () => {
    // "متب漢ادل" — CJK character mixed into Arabic
    assertEquals(isScriptContaminated("متب漢ادل", "arabic"), true);
  });

  Deno.test("pure Latin word is NOT contaminated", () => {
    assertEquals(isScriptContaminated("hello", "latin"), false);
  });

  Deno.test("Latin word with Arabic injection IS contaminated", () => {
    assertEquals(isScriptContaminated("heلllo", "latin"), true);
  });

  Deno.test("digits and punctuation are ignored", () => {
    // "word123!" — digits and punctuation should not trigger contamination
    assertEquals(isScriptContaminated("word123!", "latin"), false);
    assertEquals(isScriptContaminated("كلمة123!", "arabic"), false);
  });

  Deno.test("markdown bold markers are ignored", () => {
    // "**word**" — markdown bold should not trigger contamination
    assertEquals(isScriptContaminated("**deploy**", "latin"), false);
  });

  Deno.test("deriveExpectedScript maps known languages", () => {
    assertEquals(deriveExpectedScript("Arabic"), "arabic");
    assertEquals(deriveExpectedScript("Mandarin Chinese"), "cjk");
    assertEquals(deriveExpectedScript("Spanish"), "latin");
    assertEquals(deriveExpectedScript("Russian"), "cyrillic");
  });

  Deno.test("deriveExpectedScript returns null for unknown languages", () => {
    assertEquals(deriveExpectedScript("Klingon"), null);
    assertEquals(deriveExpectedScript("Hindi"), null); // Devanagari not registered
  });
}
