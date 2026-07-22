import React, { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { closeCard, setMode } from '../../store/detailCardSlice';
import { DetailCardLoading } from './DetailCardLoading';
import { DetailCardTooLong } from './DetailCardTooLong';
import { DetailCardTypoCheck } from './DetailCardTypoCheck';
import { DetailCardEditing } from './DetailCardEditing';
import { DetailCardSimplified } from './DetailCardSimplified';
import { DetailCardFull } from './DetailCardFull';
import { DetailCardWatchView } from './DetailCardWatchView';
import { DetailCardPronounceView } from './DetailCardPronounceView';
import { useDetailCardFlow } from './useDetailCardFlow';
import { codeToName } from '../../store/userSlice';

interface Props {
  source?: 'watch' | 'explore' | 'selection' | 'manual';
}

export function DetailCard({ source = 'selection' }: Props) {
  const dispatch = useAppDispatch();
  const { isOpen, mode, card, retryCount } = useAppSelector(s => s.detailCard);
  const { targetLanguage } = useAppSelector(s => s.user);
  const { handleAcceptCorrection, handleSubmitEdit } = useDetailCardFlow();
  const backdropRef = useRef<HTMLDivElement>(null);

  // Focus trap and keyboard close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch(closeCard());
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, dispatch]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) dispatch(closeCard());
  };

  const renderContent = () => {
    switch (mode) {
      case 'loading':
        return <DetailCardLoading />;
      case 'too_long':
        return <DetailCardTooLong />;
      case 'typo_check':
        return <DetailCardTypoCheck onAccept={handleAcceptCorrection} />;
      case 'editing':
        return <DetailCardEditing onSubmit={handleSubmitEdit} retryCount={retryCount} />;
      case 'simplified':
        return card ? <DetailCardSimplified card={card} /> : null;
      case 'full':
        return card ? <DetailCardFull card={card} source={source} /> : null;
      case 'watch':
        return card ? <DetailCardWatchView
          card={card}
          // YouglishWidget.fetch(word, language) expects full name ("english", "french")
          targetLanguage={codeToName(targetLanguage)}
          onBack={() => dispatch(setMode('full'))}
        /> : null;
      // PRONOUNCE — TEMPORARILY DISABLED (SpeechSuper integration paused)
      // Re-enable by restoring: case 'pronounce': return <DetailCardPronounceView />;
      // case 'pronounce':
      //   return <DetailCardPronounceView />;
      default:
        return null;
    }
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Word detail card"
      data-detail-card="true"
    >
      <div
        className="relative w-full sm:max-w-md bg-white sm:rounded-3xl rounded-t-3xl shadow-2xl overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#E2E8F0' }} />
        </div>

        {/* Close button */}
        <button
          onClick={() => dispatch(closeCard())}
          aria-label="Close"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-all hover:opacity-70 z-10"
          style={{ backgroundColor: '#F4F7FB', color: '#718096' }}
        >
          ✕
        </button>

        {/* Content */}
        <div className="px-5 pb-6 pt-2 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 40px)' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
