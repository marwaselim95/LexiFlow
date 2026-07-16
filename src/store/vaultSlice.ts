import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { VaultWord } from '../services/api/types';
import { getVaultMonths, getVaultWords, generateVaultParagraph as apiGenParagraph } from '../services/api/mockApi';
import { removeWordThunk, saveWordThunk } from './wordsSlice';

interface VaultState {
  months: { month: string; wordCount: number }[];
  wordsByMonth: Record<string, VaultWord[]>;
  monthsLoading: boolean;
  wordsLoading: boolean;
  error: string | null;
  currentReadSession: {
    paragraph: string | null;
    pickedWordIds: string[];
    generating: boolean;
    error: string | null;
  };
}

const initialState: VaultState = {
  months: [],
  wordsByMonth: {},
  monthsLoading: false,
  wordsLoading: false,
  error: null,
  currentReadSession: {
    paragraph: null,
    pickedWordIds: [],
    generating: false,
    error: null,
  },
};

export const loadVaultMonths = createAsyncThunk('vault/loadMonths', async () => {
  return await getVaultMonths();
});

export const loadVaultWords = createAsyncThunk('vault/loadWords', async (month: string) => {
  const words = await getVaultWords(month);
  return { month, words };
});

export const generateParagraph = createAsyncThunk(
  'vault/generateParagraph',
  async (input: { month: string; excludeWordIds: string[] }) => {
    return await apiGenParagraph(input);
  }
);

const vaultSlice = createSlice({
  name: 'vault',
  initialState,
  reducers: {
    resetReadSession(state) {
      state.currentReadSession = { paragraph: null, pickedWordIds: [], generating: false, error: null };
    },
  },
  extraReducers: builder => {
    builder
      .addCase(saveWordThunk.fulfilled, (state, action) => {
        const { word, source, wordId } = action.payload;
        const savedAt = new Date().toISOString();
        const monthKey = savedAt.slice(0, 7); // "YYYY-MM"

        const vaultWord = {
          id: wordId,
          headword: word.headword,
          nativeTranslation: word.nativeTranslation || word.synonyms[0] || '',
          savedAt,
          stage: word.stage,
          cardData: { ...word, id: wordId, source, savedAt },
        };

        if (!state.wordsByMonth[monthKey]) {
          state.wordsByMonth[monthKey] = [];
        }
        // Avoid duplicates (in case the month was already loaded)
        if (!state.wordsByMonth[monthKey].some(w => w.id === wordId)) {
          state.wordsByMonth[monthKey].push(vaultWord);
        }

        // Update months summary count
        const existing = state.months.find(m => m.month === monthKey);
        if (existing) {
          existing.wordCount += 1;
        } else {
          state.months.push({ month: monthKey, wordCount: 1 });
        }
      })
      .addCase(removeWordThunk.fulfilled, (state, action) => {
        const id = action.payload;
        for (const month in state.wordsByMonth) {
          state.wordsByMonth[month] = state.wordsByMonth[month].filter(w => w.id !== id);
        }
      })
      .addCase(loadVaultMonths.pending, state => { state.monthsLoading = true; state.error = null; })
      .addCase(loadVaultMonths.fulfilled, (state, action) => {
        state.monthsLoading = false; state.months = action.payload;
      })
      .addCase(loadVaultMonths.rejected, (state, action) => {
        state.monthsLoading = false; state.error = action.error.message || 'Error';
      })
      .addCase(loadVaultWords.pending, state => { state.wordsLoading = true; })
      .addCase(loadVaultWords.fulfilled, (state, action) => {
        state.wordsLoading = false;
        state.wordsByMonth[action.payload.month] = action.payload.words;
      })
      .addCase(loadVaultWords.rejected, (state, action) => {
        state.wordsLoading = false; state.error = action.error.message || 'Error';
      })
      .addCase(generateParagraph.pending, state => {
        state.currentReadSession.generating = true; state.currentReadSession.error = null;
      })
      .addCase(generateParagraph.fulfilled, (state, action) => {
        state.currentReadSession.generating = false;
        const result = action.payload;
        if ('error' in result) {
          state.currentReadSession.error = result.error;
        } else {
          state.currentReadSession.paragraph = result.paragraph;
          state.currentReadSession.pickedWordIds = [
            ...state.currentReadSession.pickedWordIds,
            ...result.pickedWordIds,
          ];
        }
      })
      .addCase(generateParagraph.rejected, (state, action) => {
        state.currentReadSession.generating = false;
        state.currentReadSession.error = action.error.message || 'Generation failed';
      });
  },
});

export const { resetReadSession } = vaultSlice.actions;
export default vaultSlice.reducer;
