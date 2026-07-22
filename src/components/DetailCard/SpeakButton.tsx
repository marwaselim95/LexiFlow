import React from 'react';

interface Props {
  word: string;
  lang: string;
}

export function SpeakButton({ word, lang }: Props) {
  const handleSpeak = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <button
      type="button"
      onClick={handleSpeak}
      title="Pronounce word"
      aria-label={`Pronounce ${word}`}
      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-80 active:scale-90"
      style={{ backgroundColor: '#F4F7FB', color: '#153C70' }}
    >
      🔊
    </button>
  );
}
