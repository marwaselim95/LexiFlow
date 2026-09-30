// HTTP fetch wrapper with AbortController-based timeout support.

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
  body?: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers, body, method: body ? 'POST' : 'GET' });
  } finally {
    clearTimeout(timer);
  }
}
