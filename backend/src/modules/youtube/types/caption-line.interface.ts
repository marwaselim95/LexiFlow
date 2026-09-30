/**
 * Represents a single line of video captions with timing information.
 * Used for displaying synchronized subtitles.
 */
export interface CaptionLine {
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** The caption text content */
  text: string;
}
