/**
 * A YouTube video candidate from search results.
 * Used internally for filtering and mapping search API responses.
 */
export type Candidate = {
  id: { videoId: string };
  snippet: {
    title: string;
    thumbnails: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
    channelTitle: string;
  };
};
