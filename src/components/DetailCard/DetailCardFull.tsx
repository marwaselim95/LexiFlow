import React, { useState } from 'react';
import { DetailCardData } from '../../services/api/types';
import { SaveButton } from './SaveButton';
import { SpeakButton } from './SpeakButton';
import { DetailCardWatchView } from './DetailCardWatchView';
import { useAppDispatch, useAppSelector } from '../../store';
import { setMode } from '../../store/detailCardSlice';
import { translateExplanations } from '../../services/api/mockApi';
import { codeToName } from '../../store/userSlice';

interface Props {
  card: DetailCardData;
  source?: 'watch' | 'explore' | 'selection' | 'manual';
  /**
   * When true the "▶" button swaps the card content for an inline
   * DetailCardWatchView (back arrow + "Watch: headword" header + widget).
   * Set this on all standalone usages (Explore, Mastery, VaultMonth).
   * Leave false (default) for the modal-based flow in DetailCard.tsx,
   * which dispatches setMode('watch') to trigger the global modal's watch state.
   */
  standalone?: boolean;
  /**
   * When true, forwarded to <SaveButton> so it always displays "✓ Saved".
   * Use in contexts where the word is guaranteed to already be saved
   * (e.g. MasteryPage feedback card).
   */
  forceSaved?: boolean;
}

/** Renders the example sentence with _headword_ bolded */
function ExampleSentence({ text }: { text: string }) {
  const parts = text.split(/_([^_]+)_/g);
  return (
    <p className="mt-1.5 text-sm" style={{ color: '#718096', fontFamily: 'Inter, sans-serif' }}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} style={{ color: '#1A202C' }}>{part}</strong>
          : part
      )}
    </p>
  );
}

export function DetailCardFull({ card, source, standalone = false, forceSaved = false }: Props) {
  const dispatch = useAppDispatch();
  const { nativeLanguage, targetLanguage } = useAppSelector(s => s.user);
  const [translationsVisible, setTranslationsVisible] = useState(false);
  const [translations, setTranslations] = useState<string[]>([]);
  const [translating, setTranslating] = useState(false);
  // Standalone watch-view state — only used when standalone === true
  const [showYouglish, setShowYouglish] = useState(false);
  const showTranslateIcon = nativeLanguage !== targetLanguage;

  // Standalone mode: full content-swap to DetailCardWatchView
  // Pass full name to YouglishWidget (it calls YG.Widget.fetch(word, language)
  // which expects e.g. "english" not "en")
  if (standalone && showYouglish) {
    return (
      <DetailCardWatchView
        card={card}
        targetLanguage={codeToName(targetLanguage)}
        onBack={() => setShowYouglish(false)}
      />
    );
  }

  const handleTranslate = async () => {
    const newVisible = !translationsVisible;
    setTranslationsVisible(newVisible);

    if (newVisible && translations.length === 0) {
      setTranslating(true);
      try {
        // Convert ISO code to full name — translateExplanations passes it
        // straight into an AI prompt ("Translate into ${nativeLang}")
        const result = await translateExplanations({
          explanations: card.contexts.map(c => c.explanation),
          nativeLang: codeToName(nativeLanguage),
        });
        setTranslations(result.translated);
      } finally {
        setTranslating(false);
      }
    }
  };

  const handleWatch = () => {
    if (standalone) {
      setShowYouglish(true);
    } else {
      dispatch(setMode('watch'));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2
              className="text-2xl font-bold leading-tight"
              style={{ color: '#1A202C', fontFamily: 'Poppins, sans-serif' }}
            >
              {card.headword}
            </h2>
            <SpeakButton word={card.headword} lang={targetLanguage} />
          </div>
          {card.synonyms.length > 0 && (
            <p className="mt-1 text-sm" style={{ color: '#718096', fontFamily: 'Inter, sans-serif' }}>
              {card.synonyms.join(' · ')}
            </p>
          )}
        </div>
        {showTranslateIcon && (
          <button
            onClick={handleTranslate}
            title="Toggle translated explanations"
            aria-label="Toggle translated explanations"
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:opacity-80 active:scale-90 mr-9"
            style={{
              backgroundColor: translationsVisible ? '#153C70' : '#F4F7FB',
              color: translationsVisible ? 'white' : '#153C70',
            }}
          >
            🌐
          </button>
        )}
      </div>

      {/* Context blocks */}
      <div className="flex flex-col gap-4">
        {card.contexts.map((ctx, i) => (
          <div
            key={i}
            className="rounded-2xl px-4 py-3"
            style={{ background: '#F4F7FB', border: '1px solid #E2E8F0' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#153C70' }}>
              Context: {ctx.label}
            </p>
            <p className="text-sm font-medium italic" style={{ color: '#1A202C', fontFamily: 'Inter, sans-serif' }}>
              {translationsVisible && translations[i] ? translations[i] : ctx.explanation}
              {translating && translationsVisible && !translations[i] && (
                <span className="ml-1 text-xs" style={{ color: '#718096' }}>translating…</span>
              )}
            </p>
            <ExampleSentence text={ctx.example} />
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2.5">
        <button
          onClick={handleWatch}
          title="Watch on YouGlish"
          aria-label="Watch on YouGlish"
          className="flex-1 py-2.5 rounded-full text-sm font-semibold flex items-center justify-center gap-1.5 transition-all hover:opacity-90 active:scale-95"
          style={{ backgroundColor: '#F4F7FB', color: '#153C70', fontFamily: 'Poppins, sans-serif', border: '2px solid #E2E8F0' }}
        >
          ▶
        </button>
        {/* PRONOUNCE — TEMPORARILY DISABLED (SpeechSuper integration paused)
        Re-enable by restoring the button below and the routes/nav in App.tsx + BottomNav.tsx
        <button
          onClick={() => dispatch(setMode('pronounce'))}
          className="flex-1 py-2.5 rounded-full text-sm font-semibold flex items-center justify-center gap-1.5 transition-all hover:opacity-90 active:scale-95"
          style={{ backgroundColor: '#F4F7FB', color: '#153C70', fontFamily: 'Poppins, sans-serif', border: '2px solid #E2E8F0' }}
        >
          🎤
        </button>
        */}
        <SaveButton card={card} source={source} forceSaved={forceSaved} />
      </div>
    </div>
  );
}
