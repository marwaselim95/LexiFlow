import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { DetailCardData } from '../services/api/types';
import { saveWord as apiSaveWord, removeWord as apiRemoveWord } from '../services/api/mockApi';

interface WordsState {
  entities: Record<string, DetailCardData & { source: string; savedAt: string }>;
  ids: string[];
  loading: boolean;
  error: string | null;
}

const initialState: WordsState = {
  entities: {
    'word-1': {
      id: 'word-1', headword: 'ephemeral',
      synonyms: ['éphémère', 'fugace', 'transitoire'],
      contexts: [{ label: 'General', explanation: 'Lasting for a very short time; transient.', example: 'The _ephemeral_ beauty of cherry blossoms makes them all the more precious.' }],
      stage: 2, stage6_streak: 0, active: true, savedAt: '2026-05-15T10:00:00Z', source: 'explore', nativeTranslation: 'éphémère',
    },
    'word-2': {
      id: 'word-2', headword: 'serendipity',
      synonyms: ['sérendipité', 'chance heureuse'],
      contexts: [{ label: 'General', explanation: 'The occurrence of happy accidents or pleasant surprises.', example: 'Finding my best friend was pure _serendipity_.' }],
      stage: 1, stage6_streak: 0, active: true, savedAt: '2026-05-20T14:00:00Z', source: 'watch', nativeTranslation: 'sérendipité',
    },
    'word-3': {
      id: 'word-3', headword: 'resilient',
      synonyms: ['résilient', 'robuste'],
      contexts: [{ label: 'Personal quality', explanation: 'Able to recover quickly from difficulties; tough.', example: 'She remained _resilient_ despite the repeated setbacks.' }],
      stage: 3, stage6_streak: 0, active: true, savedAt: '2026-06-01T09:00:00Z', source: 'manual', nativeTranslation: 'résilient',
    },
    'word-4': {
      id: 'word-4', headword: 'ubiquitous',
      synonyms: ['omniprésent'],
      contexts: [{ label: 'General', explanation: 'Present, appearing, or found everywhere.', example: 'Smartphones have become so _ubiquitous_ that life without one feels impossible.' }],
      stage: 0, stage6_streak: 0, active: true, savedAt: '2026-06-10T16:00:00Z', source: 'selection', nativeTranslation: 'omniprésent',
    },
    'word-5': {
      id: 'word-5', headword: 'melancholy',
      synonyms: ['mélancolie', 'tristesse douce'],
      contexts: [{ label: 'Emotional state', explanation: 'A feeling of pensive sadness, typically with no obvious cause.', example: 'A sense of _melancholy_ swept over him.' }],
      stage: 4, stage6_streak: 0, active: true, savedAt: '2026-04-05T11:00:00Z', source: 'explore', nativeTranslation: 'mélancolie',
    },
  },
  ids: ['word-1', 'word-2', 'word-3', 'word-4', 'word-5'],
  loading: false,
  error: null,
};

export const saveWordThunk = createAsyncThunk(
  'words/saveWord',
  async (input: { word: DetailCardData; source: 'manual' | 'watch' | 'explore' | 'selection' }) => {
    const result = await apiSaveWord(input);
    return { word: input.word, source: input.source, wordId: result.wordId };
  }
);

export const removeWordThunk = createAsyncThunk(
  'words/removeWord',
  async (wordId: string) => {
    await apiRemoveWord({ wordId });
    return wordId;
  }
);

const wordsSlice = createSlice({
  name: 'words',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(saveWordThunk.fulfilled, (state, action) => {
        const { word, source, wordId } = action.payload;
        const entry = { ...word, id: wordId, source, savedAt: new Date().toISOString() };
        state.entities[wordId] = entry;
        if (!state.ids.includes(wordId)) state.ids.push(wordId);
      })
      .addCase(removeWordThunk.fulfilled, (state, action) => {
        const id = action.payload;
        delete state.entities[id];
        state.ids = state.ids.filter(i => i !== id);
      });
  },
});

export default wordsSlice.reducer;
