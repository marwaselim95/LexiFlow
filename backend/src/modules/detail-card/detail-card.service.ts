import { Injectable } from '@nestjs/common';

import { AiService } from '../ai/ai.service';
import { error } from '../utils/http-error.util';
import { validateCardScripts } from '../utils/text-sanitize.util';

@Injectable()
export class DetailCardService {
  constructor(private ai: AiService) {}

  // ── generateDetailCard ──────────────────────────────────────────────────────

  async generateDetailCard(input: { text: string; nativeLang: string; targetLang: string }) {
    // Validate input fields and throw an error if any required field is missing.
    // The input object should contain the text to analyze, the native language code, and the target language code.
    // If any of these fields are missing, an HTTP error with status 400 (Bad Request) is thrown.
    const { text, nativeLang, targetLang } = input;
    if (!text || !nativeLang || !targetLang) {
      throw error('unknown', 'Missing required fields', 400);
    }

    // Server-side word-count guard (defense in depth)
    if (text.split(/\s+/).length > 50) {
      return { mode: 'too_long', card: null };
    }

    const prompt = `You are a language-learning assistant. Analyze this text: "${text}"
Native language: ${nativeLang}
Target language: ${targetLang}

Determine:
1. Does "${text}" contain MULTIPLE distinct vocabulary items that need separate elaboration, OR is it a single vocab item (possibly with surrounding context)?
   - If it has surrounding context, extract just the core word/phrase in its base/simple form (e.g. "I deployed the website" → "deploy", "something feels off" → "feels off").
   - If it is genuinely multiple unrelated items, set mode to "simplified".

2. If mode is "simplified", return:
{
  "mode": "simplified",
  "card": {
    "headword": "${text}",
    "translation": "<single translation or simplified rewrite>"
  }
}

3. If mode is "full", return:
{
  "mode": "full",
  "card": {
    "headword": "<extracted word or phrase in base form>",
    "nativeSynonyms": ["<1-3 ${nativeLang} synonyms>"],
    "contexts": [
      {
        "label": "<context domain e.g. Software Engineering, written in ${targetLang}>",
        "explanation": "<clear explanation in ${targetLang}>",
        "example": "<sentence in ${targetLang} containing the headword in bold using **headword** markdown>"
      }
    ]
  }
}

Every field except the native-language synonyms line must be written entirely in ${targetLang}. Do not mix languages within label, explanation, or example.
Provide 1-3 context blocks based on how many distinct usage contexts the word has.
Return ONLY valid JSON, no markdown fences.`;

    // Call the AI service with the constructed prompt to generate a detailed vocabulary card based on the input text. The AI is expected to return a JSON response that includes the mode (either "simplified" or "full") and the corresponding card details.
    const raw = await this.ai.callGemini(prompt, { jsonMode: true });
    let parsed: { mode: string; card: Record<string, unknown> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('[generateDetailCard] AI returned non-JSON:', raw);
      throw error('ai_error', 'AI response could not be parsed. Please try again.', 502);
    }

    // Normalize card shape to match frontend types:
    // - rename nativeSynonyms → synonyms
    // - rename translation → nativeTranslation (simplified mode)
    if (parsed.card && typeof parsed.card === 'object') {
      // If the AI response includes a card object, normalize its properties to match the expected frontend types. Specifically, rename the "nativeSynonyms" property to "synonyms" and the "translation" property to "nativeTranslation" for simplified mode. This ensures consistency in the data structure used by the frontend application.
      const card = parsed.card as Record<string, unknown>;
      if ('nativeSynonyms' in card) {
        card.synonyms = card.nativeSynonyms;
        delete card.nativeSynonyms;
      }
      if ('translation' in card) {
        card.nativeTranslation = card.translation;
        delete card.translation;
      }
    }

    // Script-contamination validation (post-processing, no retry)
    if (parsed.mode === 'full' && parsed.card && typeof parsed.card === 'object') {
      const card = parsed.card as Record<string, unknown>;
      const validation = validateCardScripts(card, nativeLang, targetLang, 'generateDetailCard');

      if (validation.headwordContaminated) {
        console.error(
          `[generateDetailCard] Headword script-contaminated, returning parse error. ` +
            `headword="${card.headword}" targetLang="${targetLang}"`,
        );
        throw error('ai_error', 'AI response could not be parsed. Please try again.', 502);
      }

      card.synonyms = validation.filteredSynonyms;
      card.contexts = validation.filteredContexts;
    }

    return parsed;
  }

  // ── checkTypos ──────────────────────────────────────────────────────────────

  async checkTypos(text: string): Promise<{ hasTypos: boolean; suggestion?: string }> {
    if (!text) throw error('unknown', 'text is required', 400);

    const prompt = `Check ONLY for spelling mistakes and typos in the following text.
Do NOT suggest grammar rewrites or style changes.
Text: "${text}"

Return ONLY valid JSON in one of these two shapes (no markdown fences):
- No typos: { "hasTypos": false }
- Has typos: { "hasTypos": true, "suggestion": "<corrected text with only spelling fixed>" }`;

    // Call the AI service with the constructed prompt to check for spelling mistakes and typos in the input text. The AI is expected to return a JSON response indicating whether typos were found and, if so, providing a corrected version of the text with only spelling errors fixed.
    const raw = await this.ai.callGemini(prompt, { jsonMode: true });
    try {
      return JSON.parse(raw);
    } catch {
      console.error('[checkTypos] AI returned non-JSON:', raw);
      throw error('ai_error', 'AI response could not be parsed. Please try again.', 502);
    }
  }

  // ── translateExplanations ───────────────────────────────────────────────────

  async translateExplanations(
    explanations: unknown,
    nativeLang: string,
  ): Promise<{ translated: string[] }> {
    if (!Array.isArray(explanations) || !nativeLang) {
      throw error('unknown', 'explanations array and nativeLang required', 400);
    }

    const prompt = `Translate the following explanation strings into ${nativeLang}.
Preserve the original order exactly. Do NOT translate example sentences — only translate explanations.
Return a JSON object: { "translations": ["...", "...", ...] } with the same count and order as the input explanations.

Input:
${JSON.stringify(explanations)}`;

    // Call the AI service with the constructed prompt to translate the explanation strings into the native language. The AI is expected to return a JSON response with the translated strings in the same order as the input.
    const raw = await this.ai.callGemini(prompt, { jsonMode: true });
    const parsed = JSON.parse(raw);
    const translated = parsed.translations ?? parsed[Object.keys(parsed)[0]] ?? [];
    return { translated };
  }
}
