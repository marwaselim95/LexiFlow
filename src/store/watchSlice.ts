import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { VideoItem, CaptionLine, DetailCardData } from '../services/api/types';
import { getSuggestedVideos, getVideoCaptions, validateVideoUrl as apiValidate } from '../services/api/mockApi';

interface WatchState {
  suggestedVideos: VideoItem[];
  promptMessage: string | null;
  lastSearchQuery: string;
  videosLoading: boolean;
  /** Tracks the requestId of the most-recently dispatched loadSuggestedVideos call.
   *  Fulfilled/rejected handlers for older in-flight requests are silently discarded. */
  latestRequestId: string | null;
  captions: CaptionLine[];
  captionsLoading: boolean;
  sessionSavedWords: Array<{ headword: string; nativeTranslation: string }>;
  urlValidating: boolean;
  urlError: string | null;
  error: string | null;
}

const initialState: WatchState = {
  suggestedVideos: [],
  promptMessage: null,
  lastSearchQuery: '',
  videosLoading: false,
  latestRequestId: null,
  captions: [],
  captionsLoading: false,
  sessionSavedWords: [],
  urlValidating: false,
  urlError: null,
  error: null,
};

export const loadSuggestedVideos = createAsyncThunk('watch/loadVideos', async (query?: string) => {
  return await getSuggestedVideos(query);
});

export const loadCaptions = createAsyncThunk('watch/loadCaptions', async (videoId: string) => {
  return await getVideoCaptions(videoId);
});

export const validateUrl = createAsyncThunk('watch/validateUrl', async (url: string) => {
  return await apiValidate({ url });
});

const watchSlice = createSlice({
  name: 'watch',
  initialState,
  reducers: {
    addSessionWord(state, action: PayloadAction<{ headword: string; nativeTranslation: string }>) {
      const exists = state.sessionSavedWords.some(w => w.headword === action.payload.headword);
      if (!exists) state.sessionSavedWords.push(action.payload);
    },
    clearSession(state) {
      state.sessionSavedWords = [];
      state.captions = [];
      state.urlError = null;
    },
    clearUrlError(state) { state.urlError = null; },
  },
  extraReducers: builder => {
    builder
      .addCase(loadSuggestedVideos.pending, (state, action) => {
        state.videosLoading = true;
        state.error = null;
        // Stamp the latest request so stale responses can be identified and discarded.
        state.latestRequestId = action.meta.requestId;
        state.lastSearchQuery = action.meta.arg ?? '';
      })
      .addCase(loadSuggestedVideos.fulfilled, (state, action) => {
        // Discard stale responses — only the most recently dispatched call wins.
        if (action.meta.requestId !== state.latestRequestId) return;
        state.videosLoading = false;
        const result = action.payload;
        if ('promptMessage' in result) {
          state.promptMessage = result.promptMessage;
          state.suggestedVideos = [];
        } else {
          state.suggestedVideos = result.videos;
          state.promptMessage = null;
        }
      })
      .addCase(loadSuggestedVideos.rejected, (state, action) => {
        // Discard stale errors — a superseded request's failure should not clobber
        // a valid result or show a spurious error message to the user.
        if (action.meta.requestId !== state.latestRequestId) return;
        state.videosLoading = false;
        state.error = action.error.message || 'Failed to load videos';
      })
      .addCase(loadCaptions.pending, state => { state.captionsLoading = true; })
      .addCase(loadCaptions.fulfilled, (state, action) => {
        state.captionsLoading = false;
        state.captions = action.payload.captions;
      })
      .addCase(loadCaptions.rejected, state => { state.captionsLoading = false; })
      .addCase(validateUrl.pending, state => { state.urlValidating = true; state.urlError = null; })
      .addCase(validateUrl.fulfilled, (state, action) => {
        state.urlValidating = false;
        if (!action.payload.valid) {
          state.urlError = action.payload.reason || 'Invalid URL';
        }
      })
      .addCase(validateUrl.rejected, state => { state.urlValidating = false; });
  },
});

export const { addSessionWord, clearSession, clearUrlError } = watchSlice.actions;
export default watchSlice.reducer;
