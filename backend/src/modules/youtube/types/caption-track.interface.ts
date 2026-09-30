/**
 * Represents a caption track available for a YouTube video.
 * Contains metadata needed to fetch and parse caption content.
 */
export interface CaptionTrack {
  /** URL endpoint to fetch the caption content from */
  baseUrl: string;
  /** Language code of the caption track (e.g. "en", "es") */
  languageCode: string;
  /** Track kind — "asr" for auto-generated, "" for manual */
  kind: string;
}
