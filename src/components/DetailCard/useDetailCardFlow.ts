import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  openCard, closeCard, setMode, setCard, setSuggestedCorrection,
  acceptCorrection, rejectCorrection, submitEdit,
} from '../../store/detailCardSlice';
import { generateDetailCard, checkTypos } from '../../services/api/mockApi';
import { codeToName } from '../../store/userSlice';

/**
 * useDetailCardFlow — orchestrates the complete DetailCard generation pipeline:
 * text → typo check → too_long guard → generate → mode routing
 */
export function useDetailCardFlow() {
  const dispatch = useAppDispatch();
  const { currentText, retryCount, originalText } = useAppSelector(s => s.detailCard);
  // Store holds ISO codes; convert to full names at the API call boundary
  // so AI prompts receive "English" not "en".
  const { nativeLanguage, targetLanguage } = useAppSelector(s => s.user);

  const runGeneration = useCallback(async (text: string) => {
    dispatch(setMode('loading'));
    try {
      const wordCount = text.trim().split(/\s+/).length;
      if (wordCount > 50) {
        dispatch(setMode('too_long'));
        return;
      }

      // Typo check first
      const typoResult = await checkTypos({ text });
      if (typoResult.hasTypos && typoResult.suggestion) {
        dispatch(setSuggestedCorrection(typoResult.suggestion));
        return;
      }

      // Generate card
      // Generate card — convert ISO codes to full names for the AI prompt
      const result = await generateDetailCard({
        text,
        nativeLang: codeToName(nativeLanguage),
        targetLang: codeToName(targetLanguage),
      });
      if (result.mode === 'too_long') {
        dispatch(setMode('too_long'));
      } else if (result.card) {
        dispatch(setCard(result.card));
        dispatch(setMode(result.mode));
      }
    } catch (err) {
      dispatch(setMode('idle')); // Will show error via parent's catch boundary
      throw err;
    }
  }, [dispatch, nativeLanguage, targetLanguage]);

  const triggerCardOpen = useCallback((text: string) => {
    dispatch(openCard(text));
    runGeneration(text);
  }, [dispatch, runGeneration]);

  const handleAcceptCorrection = useCallback((correctedText: string) => {
    dispatch(acceptCorrection());
    runGeneration(correctedText);
  }, [dispatch, runGeneration]);

  const handleSubmitEdit = useCallback((text: string) => {
    const nextRetry = retryCount + 1;
    if (nextRetry >= 5) {
      // Revert to original
      dispatch(submitEdit());
      runGeneration(originalText);
    } else {
      dispatch(submitEdit());
      runGeneration(text);
    }
  }, [dispatch, retryCount, originalText, runGeneration]);

  return { triggerCardOpen, handleAcceptCorrection, handleSubmitEdit, runGeneration };
}
