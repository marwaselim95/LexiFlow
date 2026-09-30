// Caption track discovery via InnerTube API and watch page scraping.

import { fetchWithTimeout } from './fetch-with-timeout.util';
import { CaptionTrack } from '../types/caption-track.interface';

// InnerTube API (Android client) — primary caption source.
export const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'; // Youtube InnerTube API endpoint for fetching player data, including captions.
export const INNERTUBE_CLIENT_VERSION = '20.10.38'; // The version of the YouTube InnerTube client to use for API requests. This version is used to mimic a specific client behavior when making requests to the YouTube API.
export const INNERTUBE_UA = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`; // The User-Agent string to be used for requests to the YouTube InnerTube API. It identifies the client as a specific version of the YouTube app running on Android 14.

// Browser User-Agent — fallback for watch page scraping.
export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36,gzip(gfe)';

export async function fetchTracksViaInnerTube(videoId: string): Promise<CaptionTrack[]> {
  const res = await fetchWithTimeout(INNERTUBE_API_URL, 10_000, {
    'Content-Type': 'application/json',
    'User-Agent': INNERTUBE_UA,
  }, JSON.stringify({
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: INNERTUBE_CLIENT_VERSION,
        androidSdkVersion: 34,
      },
    },
    videoId,
  }));

  // If the response from the InnerTube API is not OK (i.e., the HTTP status code is not in the 200-299 range), return an empty array to indicate that no caption tracks were found.
  if (!res.ok) return [];

  // Parse the JSON response from the InnerTube API. The response contains information about the video, including available caption tracks. If the caption tracks are not found or if the response structure is unexpected, return an empty array.
  const data: any = await res.json();
  const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks; // Extract the caption tracks from the parsed JSON response. If the caption tracks are not found or if the response structure is unexpected, return an empty array.

  // If the caption tracks are not found or if the response structure is unexpected, return an empty array to indicate that no caption tracks were found.
  if (!Array.isArray(tracks) || tracks.length === 0) return [];


  // Map the extracted caption tracks to the CaptionTrack interface. Each track includes the base URL for fetching captions, the language code, and the kind of captions (auto-generated or manual). If any of these properties are missing, default to an empty string.
  return tracks.map((t: Record<string, unknown>) => ({
    baseUrl: (t.baseUrl as string) ?? '',
    languageCode: (t.languageCode as string) ?? '',
    kind: (t.kind as string) ?? '',
  }));
}

export async function scrapeTracksFromWatchPage(videoId: string): Promise<CaptionTrack[]> {

  // Fetch the YouTube watch page for the given video ID. The watch page contains HTML that includes JavaScript variables with information about the video, including available caption tracks.
  // The fetchWithTimeout function is used to ensure that the request does not take longer than 15 seconds, and a custom User-Agent string is provided to mimic a browser request.
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetchWithTimeout(watchUrl, 15_000, { 'User-Agent': BROWSER_UA });

  if (!res.ok) throw new Error(`Watch page returned HTTP ${res.status}`);

  const html = await res.text(); // Get the HTML content of the watch page. This HTML contains JavaScript variables that include information about the video, including available caption tracks.
  

  // Check for CAPTCHA challenge in the watch page HTML. If the HTML includes a CAPTCHA challenge, throw an error to indicate that the request was blocked by YouTube's anti-bot measures. This is important because if a CAPTCHA is present, it means that the request cannot proceed to extract caption tracks.
  if (html.includes('class="g-recaptcha"')) {
    throw new Error('YouTube returned a CAPTCHA challenge');
  }

  // Extract the ytInitialPlayerResponse JSON object from the watch page HTML. This object contains information about the video, including available caption tracks. If the object is not found, throw an error to indicate that the expected data was not present in the HTML.
  const playerResponse = extractJsonObject(html, 'ytInitialPlayerResponse');

  // Throwing the error here is important because if the ytInitialPlayerResponse object is not found, it means that the expected data structure is not present in the HTML, and the function cannot proceed to extract caption tracks.
  if (!playerResponse) throw new Error('ytInitialPlayerResponse not found in watch page HTML');

  const trackList = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(trackList)) return [];

  return trackList.map((t: Record<string, unknown>) => ({
    baseUrl: (t.baseUrl as string) ?? '',
    languageCode: (t.languageCode as string) ?? '',
    kind: (t.kind as string) ?? '',
  }));
}

export function extractJsonObject(html: string, varName: string): any | null {
  const startToken = `var ${varName} = `;
  const startIndex = html.indexOf(startToken);
  if (startIndex === -1) return null;

  const jsonStart = startIndex + startToken.length;
  let depth = 0;

  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
