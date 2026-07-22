import React from 'react';
import { DetailCardData } from '../../services/api/types';
import { SaveButton } from './SaveButton';
import { useAppSelector } from '../../store';
import { SpeakButton } from './SpeakButton';

interface Props {
  card: DetailCardData;
}

export function DetailCardSimplified({ card }: Props) {
  const { targetLanguage } = useAppSelector(s => s.user);
  return (
    <div className="flex flex-col gap-5 py-4">
      <div className="text-center">
        <p className="text-xs font-medium mb-2" style={{ color: '#718096', fontFamily: 'Inter, sans-serif' }}>
          Selected phrase
        </p>
        <div className="flex items-center justify-center gap-2">
          <h2
            className="text-2xl font-bold"
            style={{ color: '#153C70', fontFamily: 'Poppins, sans-serif' }}
          >
            {card.headword}
          </h2>
          <SpeakButton word={card.headword} lang={targetLanguage} />
        </div>
        {card.nativeTranslation && (
          <p
            className="mt-2 text-base"
            style={{ color: '#718096', fontFamily: 'Inter, sans-serif' }}
          >
            {card.nativeTranslation}
          </p>
        )}
      </div>

      <div
        className="rounded-2xl px-4 py-3 text-xs text-center"
        style={{ background: '#F4F7FB', color: '#718096', fontFamily: 'Inter, sans-serif' }}
      >
        This phrase contains multiple vocabulary items. Only a simplified view is shown.
      </div>

      <div className="flex justify-center">
        <SaveButton card={card} />
      </div>
    </div>
  );
}
