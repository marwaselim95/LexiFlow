// HTTP fetch wrapper with AbortController-based timeout support.

export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController(); // Create an AbortController to manage the fetch timeout (When the time finishes the fetch will be aborted)
  const timer = setTimeout(() => controller.abort(), timeoutMs); // Set a timer to abort the fetch after the specified timeout duration
  try {
    // Perform the fetch request with the provided URL, timeout, and optional headers. The fetch will be aborted if it exceeds the specified timeout duration.
    return await fetch(url, { signal: controller.signal, headers });
  } finally {

    // Clear the timeout to prevent it from firing after the fetch completes, regardless of success or failure.
    clearTimeout(timer);
  }
}
