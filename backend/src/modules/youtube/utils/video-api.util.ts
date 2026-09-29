// YouTube Data API helpers for audio language detection and video ID extraction from URLs.

export async function fetchAudioLanguages(
  videoIds: string[],
  apiKey: string,
): Promise<Map<string, string>> {
  // If no video IDs are provided or if the API key is missing, return an empty map.
  if (videoIds.length === 0) return new Map();
  if (!apiKey) return new Map();

  // Create an AbortController to manage the fetch timeout. If the request takes longer than 15 seconds, it will be aborted.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    // Make a request to the YouTube Data API to fetch video details, including the default audio language.
    // The request includes the video IDs and the API key. The fetchWithTimeout method is used to ensure that the request does not take longer than 15 seconds.
    res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}&key=${apiKey}`,
      { signal: controller.signal },
    );
  } catch (err) {
    // If the fetch request fails (e.g., due to a timeout), clear the timeout and rethrow the error.
    clearTimeout(timer);
    throw err;
  }
  // Clear the timeout to prevent it from firing after the fetch completes, regardless of success or failure.
  clearTimeout(timer);

  // If the response from the YouTube Data API is not OK (i.e., the HTTP status code is not in the 200-299 range), throw an error with the status code.
  if (!res.ok) throw new Error(`YouTube videos API HTTP ${res.status}`);

  // Here is the data returned from the YouTube Data API. It contains information about the requested videos, including their default audio languages.
  const data = await res.json();

  // What is this map? The map is a collection that associates each video ID with its corresponding default audio language. It is used to quickly look up the audio language for a given video ID.
  const langMap = new Map<string, string>();
  for (const item of data.items ?? []) {

    // The default audio language is extracted from the snippet of each video item. If the default audio language is available, it is split to get the primary language code (e.g., "en" from "en-US") and stored in the map with the video ID as the key.
    const audioLang: string | undefined =
      item.snippet?.defaultAudioLanguage ?? item.snippet?.defaultLanguage;

      // If the default audio language is available, it is split to get the primary language code (e.g., "en" from "en-US") and stored in the map with the video ID as the key.
    if (audioLang) {
      langMap.set(item.id, audioLang.split('-')[0].toLowerCase());
    }
  }
  return langMap;
}

export function extractVideoId(url: string): string | null {
  try {
    // Attempt to parse the provided URL and extract the video ID based on known YouTube URL patterns.
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.slice(1);
    if (parsed.hostname.includes('youtube.com')) return parsed.searchParams.get('v');
  } catch {
    // not a URL
  }
  return null;
}
