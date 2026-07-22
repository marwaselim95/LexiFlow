import React, { useState, useMemo } from 'react';
import { DetailCardData } from '../../services/api/types';
import { useAppDispatch, useAppSelector } from '../../store';
import { saveWordThunk, removeWordThunk } from '../../store/wordsSlice';
import { showToast } from '../../store/uiSlice';
import { addSessionWord } from '../../store/watchSlice';

interface Props {
  card: DetailCardData;
  source?: 'manual' | 'watch' | 'explore' | 'selection';
  /**
   * When true, the button always displays "✓ Saved" regardless of whether the
   * Redux slices have loaded this word. The actualSavedWordId lookup still runs
   * so the Remove confirmation flow can still find and delete the correct word.
   * Only pass this from contexts where the word is guaranteed to be saved
   * (e.g. MasteryPage, where all queued words are already in the words table).
   */
  forceSaved?: boolean;
}

export function SaveButton({ card, source = 'manual', forceSaved = false }: Props) {
  const dispatch = useAppDispatch();
  const wordsEntities = useAppSelector(s => s.words.entities);
  const vaultWordsByMonth = useAppSelector(s => s.vault.wordsByMonth);

  const actualSavedWordId = useMemo(() => {
    if (wordsEntities[card.id]) return card.id;
    
    const lowerHeadword = card.headword.toLowerCase();
    
    const wordEntity = Object.values(wordsEntities).find(w => w.headword.toLowerCase() === lowerHeadword);
    if (wordEntity) return wordEntity.id;

    for (const month in vaultWordsByMonth) {
      const vaultWord = vaultWordsByMonth[month].find(w => w.headword.toLowerCase() === lowerHeadword);
      if (vaultWord) return vaultWord.id;
    }

    return null;
  }, [wordsEntities, vaultWordsByMonth, card.id, card.headword]);

  // forceSaved short-circuits only the *displayed* state — the underlying
  // actualSavedWordId lookup above still runs so Remove can find the real ID.
  const isActuallySaved = forceSaved || !!actualSavedWordId;
  const [saving, setSaving] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const handleSave = async () => {
    if (isActuallySaved) {
      setConfirmVisible(true);
      return;
    }
    setSaving(true);
    try {
      await dispatch(saveWordThunk({ word: card, source })).unwrap();
      if (source === 'watch') {
        dispatch(addSessionWord({
          headword: card.headword,
          nativeTranslation: card.nativeTranslation || card.synonyms[0] || '',
        }));
      }
      dispatch(showToast({ message: `"${card.headword}" saved!`, type: 'success' }));
    } catch {
      dispatch(showToast({ message: 'Failed to save. Please try again.', type: 'error' }));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!actualSavedWordId) return;
    try {
      await dispatch(removeWordThunk(actualSavedWordId)).unwrap();
      setConfirmVisible(false);
      dispatch(showToast({ message: `"${card.headword}" removed.`, type: 'info' }));
    } catch {
      dispatch(showToast({ message: 'Failed to remove. Please try again.', type: 'error' }));
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleSave}
        disabled={saving}
        aria-label={isActuallySaved ? 'Remove word' : 'Save word'}
        className="py-2.5 px-4 rounded-full text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
        style={{
          backgroundColor: isActuallySaved ? '#D1FAE5' : '#153C70',
          color: isActuallySaved ? '#065F46' : 'white',
          fontFamily: 'Poppins, sans-serif',
        }}
      >
        {saving ? '...' : isActuallySaved ? '✓ Saved' : 'Save'}
      </button>

      {/* Remove confirmation popover */}
      {confirmVisible && (
        <div
          className="absolute bottom-12 right-0 z-10 rounded-2xl shadow-xl p-4 flex flex-col gap-3 min-w-[180px]"
          style={{ background: 'white', border: '2px solid #E2E8F0' }}
        >
          <p className="text-sm font-medium" style={{ color: '#1A202C', fontFamily: 'Inter, sans-serif' }}>
            Remove word?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRemove}
              className="flex-1 py-2 rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: '#991B1B' }}
            >
              Remove
            </button>
            <button
              onClick={() => setConfirmVisible(false)}
              className="flex-1 py-2 rounded-full text-xs font-semibold"
              style={{ backgroundColor: '#F4F7FB', color: '#718096' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
