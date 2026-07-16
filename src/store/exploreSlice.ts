import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { DetailCardData } from '../services/api/types';
import { getExploreSuggestions, searchExplore as apiSearch } from '../services/api/mockApi';

interface ExploreState {
  cards: DetailCardData[];
  emptyMessage: string | null;
  searchQuery: string;
  searchResults: DetailCardData[];
  safetyError: boolean;
  loading: boolean;
  searchLoading: boolean;
  error: string | null;
}

const initialState: ExploreState = {
  cards: [],
  emptyMessage: null,
  searchQuery: '',
  searchResults: [],
  safetyError: false,
  loading: false,
  searchLoading: false,
  error: null,
};

export const loadExploreSuggestions = createAsyncThunk(
  'explore/load',
  async (forceRefresh: boolean = false) => {
    return await getExploreSuggestions(forceRefresh);
  }
);

export const searchExplore = createAsyncThunk(
  'explore/search',
  async (input: { query: string; lang: 'native' | 'target' }) => {
    return await apiSearch(input);
  }
);

const exploreSlice = createSlice({
  name: 'explore',
  initialState,
  reducers: {
    setSearchQuery(state, action) { state.searchQuery = action.payload; },
    clearSearch(state) {
      state.searchQuery = '';
      state.searchResults = [];
      state.safetyError = false;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadExploreSuggestions.pending, state => {
        state.loading = true; state.error = null; state.emptyMessage = null;
      })
      .addCase(loadExploreSuggestions.fulfilled, (state, action) => {
        state.loading = false;
        const result = action.payload;
        if ('emptyMessage' in result) {
          state.emptyMessage = result.emptyMessage;
          state.cards = [];
        } else {
          state.cards = result.cards;
          state.emptyMessage = null;
        }
      })
      .addCase(loadExploreSuggestions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load suggestions';
      })
      .addCase(searchExplore.pending, state => {
        state.searchLoading = true; state.safetyError = false;
      })
      .addCase(searchExplore.fulfilled, (state, action) => {
        state.searchLoading = false;
        const result = action.payload;
        if ('safetyError' in result) {
          state.safetyError = true;
          state.searchResults = [];
        } else {
          state.searchResults = result.cards;
          state.safetyError = false;
        }
      })
      .addCase(searchExplore.rejected, state => { state.searchLoading = false; });
  },
});

export const { setSearchQuery, clearSearch } = exploreSlice.actions;
export default exploreSlice.reducer;
