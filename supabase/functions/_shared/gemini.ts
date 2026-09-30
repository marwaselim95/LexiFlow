// Shared AI client — all edge functions import `callGemini` from here.
//
// Provider priority:
//   1. GROQ_API_KEY  → Groq (api.groq.com, llama-3.3-70b-versatile)
//   2. GEMINI_API_KEY / OPEN_ROUTER → OpenRouter (openrouter.ai, openrouter/free)
//
// Both providers use OpenAI-compatible chat/completions, so the request shape is
// identical; only the base URL, model, and key differ.
//
// NOTE: The function is still named `callGemini` to avoid touching every import
// site across the codebase. A rename to `callAI` is recommended as a future
// naming-cleanup pass.

// ── Provider configuration ──────────────────────────────────────────────────

interface ProviderConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  name: string;
  /** Prefix for thrown error names, e.g. "GROQ" → "GROQ_RATE_LIMITED". */
  errorPrefix: string;
  /** Extra headers specific to this provider (e.g. OpenRouter's Referer). */
  extraHeaders?: Record<string, string>;
}

function resolveProvider(): ProviderConfig {
  // 1. Groq (primary — the only key currently provisioned)
  const groqKey = Deno.env.get("GROQ_API_KEY")?.trim();
  if (groqKey) {
    return {
      baseUrl: "https://api.groq.com/openai/v1",
      model: "openai/gpt-oss-20b",
      apiKey: groqKey,
      name: "groq",
      errorPrefix: "GROQ",
    };
  }

  // 2. OpenRouter (legacy fallback — kept for forward-compatibility if an
  //    OpenRouter key is added later; costs nothing to preserve)
  const orKey = (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("OPEN_ROUTER") ?? "").trim();
  if (orKey) {
    return {
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openrouter/free",
      apiKey: orKey,
      name: "openrouter",
      errorPrefix: "GEMINI",
      extraHeaders: {
        "HTTP-Referer": "http://localhost:54321",
        "X-Title": "LexiFlow",
      },
    };
  }

  throw new Error(
    "AI_MISSING_KEY: No AI API key found. " +
    "Set GROQ_API_KEY (recommended) or GEMINI_API_KEY / OPEN_ROUTER in .env.local."
  );
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function callGemini(
  prompt: string,
  opts: { timeoutMs?: number; jsonMode?: boolean } = {}
): Promise<string> {
  const provider = resolveProvider();

  // ── Timeout: cap at 25 s to stay inside edge runtime wall-clock limit ─────
  const { timeoutMs = 25_000, jsonMode = false } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // ── Build OpenAI-compatible request body ──────────────────────────────────
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: [{ role: "user", content: prompt }],
  };

  // Both Groq and OpenRouter support OpenAI's response_format for JSON output
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
        ...provider.extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${provider.errorPrefix}_TIMEOUT: ${provider.name} did not respond within ${timeoutMs}ms`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${provider.errorPrefix}_FETCH_ERROR: ${msg}`);
  }
  clearTimeout(timer);

  // ── HTTP-level errors ──────────────────────────────────────────────────────
  if (res.status === 429) {
    throw new Error(`${provider.errorPrefix}_RATE_LIMITED: 429 rate limited by ${provider.name}`);
  }
  if (res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => "(unreadable)");
    throw new Error(`${provider.errorPrefix}_AUTH_ERROR: HTTP ${res.status} from ${provider.name} — API key invalid or expired. ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    if (text.includes("SAFETY")) {
      throw new Error(`${provider.errorPrefix}_SAFETY_BLOCK: ` + text);
    }
    throw new Error(`${provider.errorPrefix}_HTTP_ERROR: HTTP ${res.status} from ${provider.name}: ${text.slice(0, 300)}`);
  }

  // ── Parse OpenAI-compatible response envelope ─────────────────────────────
  let data: { choices: { message: { content: string } }[] };
  try {
    data = await res.json();
  } catch (parseErr) {
    console.error(`[callGemini] Failed to parse ${provider.name} response envelope:`, parseErr);
    throw new Error(`${provider.errorPrefix}_ENVELOPE_PARSE_ERROR: ${provider.name} response was not valid JSON`);
  }

  const content = data.choices?.[0]?.message?.content ?? "";
  return content;
}

// ── Error classification helpers ────────────────────────────────────────────
// These check both GEMINI_ and GROQ_ prefixes so callers don't need to know
// which provider was active.

export function isSafetyBlock(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.startsWith("GEMINI_SAFETY_BLOCK") || err.message.startsWith("GROQ_SAFETY_BLOCK");
}

/** Returns true for any AI-provider-originated error (Groq or OpenRouter). */
export function isGeminiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message.startsWith("GEMINI_") || err.message.startsWith("GROQ_") || err.message.startsWith("AI_");
}
