import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../store';
import { completeOnboarding, SUPPORTED_LANGUAGES } from '../../store/userSlice';
import { updateNativeLanguage } from '../../services/api/mockApi';

export default function OnboardingPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  // Default values are ISO codes — matches what completeOnboarding now stores
  const [nativeLang, setNativeLang] = useState('ar');
  const [targetLang, setTargetLang] = useState('en');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(completeOnboarding({ nativeLanguage: nativeLang, targetLanguage: targetLang }));
    // Persist native language to profiles table so edge functions
    // (getExploreSuggestions, searchExplore, etc.) read the correct value.
    // Fire-and-forget — don't block navigation on the DB write.
    updateNativeLanguage(nativeLang).catch((err) =>
      console.error('[Onboarding] Failed to persist native language:', err)
    );
    navigate('/mastery');
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-6"
      style={{ background: 'linear-gradient(160deg, #0E2954 0%, #153C70 60%, #1E4D99 100%)' }}
    >
      {/* Logo/hero */}
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">🐝</div>
        <h1
          className="text-3xl font-bold text-white"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          LexiFlow
        </h1>
        <p className="mt-1.5 text-white/70 text-sm">
          Your neuro-powered language learning companion
        </p>
      </div>

      {/* Card */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl p-6 flex flex-col gap-5"
        style={{ backgroundColor: 'white', boxShadow: '0 32px 80px rgba(0,0,0,0.35)' }}
      >
        <div>
          <h2
            className="text-lg font-bold mb-1"
            style={{ color: '#1A202C', fontFamily: 'Poppins, sans-serif' }}
          >
            Let's get started
          </h2>
          <p className="text-sm" style={{ color: '#718096', fontFamily: 'Inter, sans-serif' }}>
            Tell us your languages to personalize your experience.
          </p>
        </div>

        {/* Native language */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="native-lang"
            className="text-xs font-semibold"
            style={{ color: '#718096', fontFamily: 'Poppins, sans-serif' }}
          >
            YOUR NATIVE LANGUAGE
          </label>
          <select
            id="native-lang"
            value={nativeLang}
            onChange={e => setNativeLang(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl text-sm border outline-none cursor-pointer"
            style={{
              border: '2px solid #E2E8F0',
              fontFamily: 'Inter, sans-serif',
              color: '#1A202C',
              backgroundColor: '#F4F7FB',
            }}
          >
            {SUPPORTED_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.name}</option>
            ))}
          </select>
        </div>

        {/* Target language */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="target-lang"
            className="text-xs font-semibold"
            style={{ color: '#718096', fontFamily: 'Poppins, sans-serif' }}
          >
            LANGUAGE YOU'RE LEARNING
          </label>
          <select
            id="target-lang"
            value={targetLang}
            onChange={e => setTargetLang(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl text-sm border outline-none cursor-pointer"
            style={{
              border: '2px solid #E2E8F0',
              fontFamily: 'Inter, sans-serif',
              color: '#1A202C',
              backgroundColor: '#F4F7FB',
            }}
          >
            {SUPPORTED_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.name}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="w-full py-3 rounded-full text-sm font-bold text-white transition-all hover:opacity-90 active:scale-95 mt-1"
          style={{ backgroundColor: '#153C70', fontFamily: 'Poppins, sans-serif' }}
        >
          Start Learning 🚀
        </button>
      </form>

      {/* Decorative dots */}
      <div className="flex gap-2 mt-8 opacity-30">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="w-2 h-2 rounded-full bg-white" />
        ))}
      </div>
    </div>
  );
}
