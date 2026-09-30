// Script-contamination detection for LLM-generated text.
// Port of supabase/functions/_shared/textSanitize.ts (Deno test block omitted).

import { ScriptName } from './types/script-name.type';
import { ContaminationResult } from './types/contamination-result.interface';

const SCRIPT_RANGES: Record<ScriptName, Array<[number, number]>> = {
  arabic: [
    [0x0600, 0x06ff],
    [0x0750, 0x077f],
    [0x08a0, 0x08ff],
    [0xfb50, 0xfdff],
    [0xfe70, 0xfeff],
  ],
  latin: [
    [0x0041, 0x005a],
    [0x0061, 0x007a],
    [0x00c0, 0x00ff],
    [0x0100, 0x024f],
    [0x1e00, 0x1eff],
  ],
  cjk: [
    [0x4e00, 0x9fff],
    [0x3400, 0x4dbf],
    [0x20000, 0x2a6df],
    [0x2a700, 0x2b73f],
    [0x2b740, 0x2b81f],
    [0x3000, 0x303f],
    [0x3040, 0x309f],
    [0x30a0, 0x30ff],
    [0xff00, 0xffef],
  ],
  cyrillic: [
    [0x0400, 0x04ff],
    [0x0500, 0x052f],
    [0x2de0, 0x2dff],
    [0xa640, 0xa69f],
  ],
};

const IGNORABLE_RE = /^[\d\s\p{P}\p{S}\u200c\u200d\u00b7\ufeff\u200b*]+$/u;

function codePointBelongsTo(cp: number, script: ScriptName): boolean {
  return SCRIPT_RANGES[script].some(([lo, hi]) => cp >= lo && cp <= hi);
}

function isIgnorable(char: string): boolean {
  return IGNORABLE_RE.test(char);
}

export function isScriptContaminated(word: string, expectedScript: ScriptName): boolean {
  for (const char of word) {
    if (isIgnorable(char)) continue;
    const cp = char.codePointAt(0)!;
    if (codePointBelongsTo(cp, expectedScript)) continue;

    for (const [otherScript, ranges] of Object.entries(SCRIPT_RANGES)) {
      if (otherScript === expectedScript) continue;
      if (ranges.some(([lo, hi]) => cp >= lo && cp <= hi)) return true;
    }
  }
  return false;
}

const LANG_TO_SCRIPT: Record<string, ScriptName> = {
  arabic: 'arabic', persian: 'arabic', farsi: 'arabic', urdu: 'arabic',
  pashto: 'arabic', kurdish: 'arabic',

  english: 'latin', spanish: 'latin', french: 'latin', german: 'latin',
  italian: 'latin', portuguese: 'latin', dutch: 'latin', swedish: 'latin',
  norwegian: 'latin', danish: 'latin', finnish: 'latin', polish: 'latin',
  czech: 'latin', romanian: 'latin', turkish: 'latin', vietnamese: 'latin',
  indonesian: 'latin', malay: 'latin', tagalog: 'latin', swahili: 'latin',
  catalan: 'latin', hungarian: 'latin', croatian: 'latin',

  chinese: 'cjk', 'mandarin chinese': 'cjk', mandarin: 'cjk',
  cantonese: 'cjk', japanese: 'cjk', korean: 'cjk',

  russian: 'cyrillic', ukrainian: 'cyrillic', bulgarian: 'cyrillic',
  serbian: 'cyrillic', belarusian: 'cyrillic', macedonian: 'cyrillic',
};

export function deriveExpectedScript(langName: string): ScriptName | null {
  const key = langName.trim().toLowerCase();
  return LANG_TO_SCRIPT[key] ?? null;
}



function textIsContaminated(text: string, script: ScriptName): boolean {
  const words = String(text).split(/\s+/).filter(Boolean);
  return words.some((w) => isScriptContaminated(w, script));
}

export function validateCardScripts(
  card: Record<string, unknown>,
  nativeLang: string,
  targetLang: string,
  fnLabel: string,
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

  if (targetScript && typeof card.headword === 'string') {
    if (textIsContaminated(card.headword, targetScript)) {
      console.warn(
        `[${fnLabel}] SCRIPT_CONTAMINATION headword="${card.headword}" ` +
        `targetLang="${targetLang}" expectedScript="${targetScript}"`,
      );
      result.headwordContaminated = true;
      return result;
    }
  }

  const rawSynonyms = Array.isArray(card.synonyms) ? (card.synonyms as string[]) : [];

  if (nativeScript) {
    result.filteredSynonyms = rawSynonyms.filter((syn) => {
      const contaminated = textIsContaminated(syn, nativeScript);
      if (contaminated) {
        console.warn(
          `[${fnLabel}] SCRIPT_CONTAMINATION field="synonyms" value="${syn}" ` +
          `nativeLang="${nativeLang}" expectedScript="${nativeScript}"`,
        );
        result.synonymsRemoved++;
      }
      return !contaminated;
    });
  } else {
    result.filteredSynonyms = rawSynonyms;
  }

  const rawContexts = Array.isArray(card.contexts)
    ? (card.contexts as Array<Record<string, unknown>>)
    : [];

  if (targetScript) {
    result.filteredContexts = rawContexts.filter((ctx) => {
      for (const field of ['label', 'explanation', 'example'] as const) {
        const value = ctx[field];
        if (typeof value === 'string' && textIsContaminated(value, targetScript)) {
          console.warn(
            `[${fnLabel}] SCRIPT_CONTAMINATION field="contexts.${field}" value="${value}" ` +
            `targetLang="${targetLang}" expectedScript="${targetScript}"`,
          );
          result.contextsRemoved++;
          return false;
        }
      }
      return true;
    });
  } else {
    result.filteredContexts = rawContexts;
  }

  return result;
}
