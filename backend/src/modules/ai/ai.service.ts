import { Injectable } from '@nestjs/common';

// Port of supabase/functions/_shared/gemini.ts.
// Provider priority: GROQ_API_KEY → Groq, else GEMINI_API_KEY/OPEN_ROUTER → OpenRouter.

interface ProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  name: string;
  errorPrefix: string;
  extraHeaders?: Record<string, string>;
}

@Injectable()
export class AiService {
  private resolveProvider(): ProviderConfig {
    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (groqKey) {
      return {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        apiKey: groqKey,
        name: 'groq',
        errorPrefix: 'GROQ',
      };
    }

    const orKey = (
      process.env.GEMINI_API_KEY ?? process.env.OPEN_ROUTER ?? ''
    ).trim();
    if (orKey) {
      return {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openrouter/free',
        apiKey: orKey,
        name: 'openrouter',
        errorPrefix: 'GEMINI',
        extraHeaders: {
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'LexiFlow',
        },
      };
    }

    throw new Error(
      'AI_MISSING_KEY: No AI API key found. ' +
        'Set GROQ_API_KEY (recommended) or GEMINI_API_KEY / OPEN_ROUTER in backend .env.',
    );
  }

  async callGemini(
    prompt: string,
    opts: { timeoutMs?: number; jsonMode?: boolean } = {},
  ): Promise<string> {
    const provider = this.resolveProvider();

    const { timeoutMs = 25_000, jsonMode = false } = opts;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const body: Record<string, unknown> = {
      model: provider.model,
      messages: [{ role: 'user', content: prompt }],
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    let res: Response;
    try {
      res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
          ...provider.extraHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `${provider.errorPrefix}_TIMEOUT: ${provider.name} did not respond within ${timeoutMs}ms`,
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`${provider.errorPrefix}_FETCH_ERROR: ${msg}`);
    }
    clearTimeout(timer);

    if (res.status === 429) {
      throw new Error(`${provider.errorPrefix}_RATE_LIMITED: 429 rate limited by ${provider.name}`);
    }
    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => '(unreadable)');
      throw new Error(
        `${provider.errorPrefix}_AUTH_ERROR: HTTP ${res.status} from ${provider.name} — API key invalid or expired. ${text.slice(0, 200)}`,
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '(unreadable)');
      if (text.includes('SAFETY')) {
        throw new Error(`${provider.errorPrefix}_SAFETY_BLOCK: ` + text);
      }
      throw new Error(
        `${provider.errorPrefix}_HTTP_ERROR: HTTP ${res.status} from ${provider.name}: ${text.slice(0, 300)}`,
      );
    }

    let data: { choices: Array<{ message: { content: string } }> };
    try {
      data = await res.json();
    } catch (parseErr) {
      console.error(`[callGemini] Failed to parse ${provider.name} response envelope:`, parseErr);
      throw new Error(
        `${provider.errorPrefix}_ENVELOPE_PARSE_ERROR: ${provider.name} response was not valid JSON`,
      );
    }

    return data.choices?.[0]?.message?.content ?? '';
  }

  isSafetyBlock(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return (
      err.message.startsWith('GEMINI_SAFETY_BLOCK') ||
      err.message.startsWith('GROQ_SAFETY_BLOCK')
    );
  }
}
