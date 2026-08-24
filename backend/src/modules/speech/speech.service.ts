import { Injectable } from '@nestjs/common';

// Port of supabase/functions/assessPronunciation — SpeechSuper client.

export interface PhonemeStatus {
  phoneme: string;
  status: 'excellent' | 'good' | 'wrong';
}

function bucketScore(score: number): 'excellent' | 'good' | 'wrong' {
  if (score >= 80) return 'excellent';
  if (score >= 50) return 'good';
  return 'wrong';
}

@Injectable()
export class SpeechService {
  private get apiKey(): string {
    return process.env.SPEECHSUPER_API_KEY ?? '';
  }

  private get appKey(): string {
    return process.env.SPEECHSUPER_APP_KEY ?? '';
  }

  /** Returns null when SpeechSuper is not configured (caller handles fallback). */
  isConfigured(): boolean {
    return Boolean(this.apiKey && this.appKey);
  }

  async evaluateWord(
    audioBase64: string,
    word: string,
    targetLang: string,
  ): Promise<{ score: number; phonemeBreakdown: PhonemeStatus[] }> {
    if (!this.isConfigured()) {
      throw new Error('AI_MISSING_KEY: SPEECHSUPER_API_KEY / SPEECHSUPER_APP_KEY are not configured');
    }

    // Map ISO 639-1 codes to SpeechSuper locale codes.
    const LOCALE_MAP: Record<string, string> = {
      ar: 'ar-SA', zh: 'zh-CN', nl: 'nl-NL', en: 'en-US', fr: 'fr-FR', de: 'de-DE',
      el: 'el-GR', he: 'he-IL', hi: 'hi-IN', id: 'id-ID', it: 'it-IT', ja: 'ja-JP',
      ko: 'ko-KR', fa: 'fa-IR', pl: 'pl-PL', pt: 'pt-BR', ro: 'ro-RO', ru: 'ru-RU',
      es: 'es-ES', sv: 'sv-SE', th: 'th-TH', tr: 'tr-TR', uk: 'uk-UA', vi: 'vi-VN',
    };

    const payload = {
      appKey: this.appKey,
      request: {
        coreType: 'word.eval',
        refText: word,
        audioType: 'mp3',
        audioData: audioBase64,
        language: LOCALE_MAP[targetLang] ?? 'en-US',
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    let res: Response;
    try {
      res = await fetch('https://api.speechsuper.com/word/eval', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
    clearTimeout(timer);

    if (!res.ok) throw new Error(`SpeechSuper HTTP ${res.status}`);

    const data = await res.json();

    const rawPhonemes: Array<{ phoneme: string; score: number }> =
      data?.result?.phonemeList ?? data?.result?.words?.[0]?.phonemes ?? [];

    const phonemeBreakdown = rawPhonemes.map((p) => ({
      phoneme: p.phoneme,
      status: bucketScore(p.score),
    }));

    const overallScore: number = data?.result?.pronunciation ?? data?.result?.fluency ?? 0;

    return { score: overallScore, phonemeBreakdown };
  }
}
