import React from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { setMode } from '../../store/detailCardSlice';
import { PronunciationRecorder } from '../PronunciationRecorder/PronunciationRecorder';
import { codeToName } from '../../store/userSlice';

export function DetailCardPronounceView() {
  const dispatch = useAppDispatch();
  const { card } = useAppSelector(s => s.detailCard);
  const { targetLanguage } = useAppSelector(s => s.user);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => dispatch(setMode('full'))}
          aria-label="Back to card"
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:opacity-80"
          style={{ backgroundColor: '#F4F7FB', color: '#153C70' }}
        >
          ←
        </button>
        <span className="font-semibold text-sm" style={{ color: '#1A202C', fontFamily: 'Poppins, sans-serif' }}>
          Pronounce: <em>{card?.headword}</em>
        </span>
      </div>

      {card && (
        <PronunciationRecorder
          word={card.headword}
          // SpeechSuper API expects full language name, not ISO code
          targetLang={codeToName(targetLanguage)}
        />
      )}
    </div>
  );
}
