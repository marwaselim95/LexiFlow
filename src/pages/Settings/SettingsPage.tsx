import React, { useEffect, useState, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  SUPPORTED_LANGUAGES,
  codeToName,
  setLearningLanguages,
  setActiveTargetLanguage,
  setNativeLanguage,
  addLanguageToList,
} from '../../store/userSlice';
import {
  getLearningLanguages,
  addLearningLanguage as apiAddLang,
  setActiveLanguage as apiSetActive,
  updateNativeLanguage as apiUpdateNative,
} from '../../services/api/mockApi';
import { resetSession } from '../../store/masterySessionSlice';
import { resetVaultData } from '../../store/vaultSlice';
import { clearSearch } from '../../store/exploreSlice';

// ─── Flag emoji map (keyed on ISO 639-1 codes) ────────────────────────────────
const FLAG_MAP: Record<string, string> = {
  ar: '🇸🇦', zh: '🇨🇳', nl: '🇳🇱', en: '🇬🇧', fr: '🇫🇷',
  de: '🇩🇪', el: '🇬🇷', he: '🇮🇱', hi: '🇮🇳', id: '🇮🇩',
  it: '🇮🇹', ja: '🇯🇵', ko: '🇰🇷', fa: '🇮🇷', pl: '🇵🇱',
  pt: '🇵🇹', ro: '🇷🇴', ru: '🇷🇺', es: '🇪🇸', sv: '🇸🇪',
  th: '🇹🇭', tr: '🇹🇷', uk: '🇺🇦', vi: '🇻🇳',
};

function getFlag(code: string) {
  return FLAG_MAP[code] ?? '🌐';
}

// ─── Add-language picker modal ────────────────────────────────────────────────

interface AddLanguagePickerProps {
  excludeCodes: string[];
  onSelect: (code: string) => void;
  onClose: () => void;
  loading: boolean;
}

function AddLanguagePicker({ excludeCodes, onSelect, onClose, loading }: AddLanguagePickerProps) {
  const available = SUPPORTED_LANGUAGES.filter(l => !excludeCodes.includes(l.code));
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  const onBackdrop = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={onBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Add a learning language"
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        backgroundColor: 'rgba(14,41,84,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: 24,
          padding: '24px 20px',
          width: '100%',
          maxWidth: 360,
          maxHeight: '70vh',
          overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 16, color: '#1A202C', margin: 0 }}>
            Add a language
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: '#F4F7FB', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: '#718096', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {available.map(lang => (
            <button
              key={lang.code}
              onClick={() => onSelect(lang.code)}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 14, border: '2px solid #E2E8F0',
                backgroundColor: 'white', cursor: 'pointer', width: '100%',
                fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#1A202C',
                transition: 'border-color 0.15s, background-color 0.15s',
                opacity: loading ? 0.6 : 1,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#153C70';
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EEF2FA';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0';
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'white';
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>{getFlag(lang.code)}</span>
              <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 500 }}>{lang.name}</span>
            </button>
          ))}
          {available.length === 0 && (
            <p style={{ color: '#718096', fontFamily: 'Inter, sans-serif', fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
              You're already learning all supported languages!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const dispatch = useAppDispatch();
  const { nativeLanguage, targetLanguage, learningLanguages } = useAppSelector(s => s.user);

  const [loadingLanguages, setLoadingLanguages] = useState(false);
  const [nativeLoading, setNativeLoading] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [addingLang, setAddingLang] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Load learning languages on mount ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingLanguages(true);
    getLearningLanguages()
      .then(res => {
        if (cancelled) return;
        dispatch(setLearningLanguages({
          languages: res.languages.map(l => l.code),
          activeLanguage: res.activeLanguage,
        }));
      })
      .catch(err => {
        if (!cancelled) setError(err.message ?? 'Failed to load languages');
      })
      .finally(() => {
        if (!cancelled) setLoadingLanguages(false);
      });
    return () => { cancelled = true; };
  }, [dispatch]);

  // ── Auto-clear success message ─────────────────────────────────────────────
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 2500);
    return () => clearTimeout(t);
  }, [successMsg]);

  // ── Native language change ─────────────────────────────────────────────────
  const handleNativeChange = async (code: string) => {
    setNativeLoading(true);
    setError(null);
    try {
      await apiUpdateNative(code);
      dispatch(setNativeLanguage(code));
      setSuccessMsg('Native language updated');
    } catch (err: any) {
      setError(err.message ?? 'Failed to update native language');
    } finally {
      setNativeLoading(false);
    }
  };

  // ── Switch active target language ──────────────────────────────────────────
  const handleSwitchActive = async (code: string) => {
    if (code === targetLanguage || switchingTo) return;
    setSwitchingTo(code);
    setError(null);
    try {
      await apiSetActive(code);
      dispatch(setActiveTargetLanguage(code));
      // Clear cached data for the old language so pages re-fetch for the new one
      dispatch(resetSession());
      dispatch(resetVaultData());
      dispatch(clearSearch());
      setSuccessMsg(`Switched to ${codeToName(code)}`);
    } catch (err: any) {
      setError(err.message ?? 'Failed to switch language');
    } finally {
      setSwitchingTo(null);
    }
  };

  // ── Add a new language ─────────────────────────────────────────────────────
  const handleAddLanguage = async (code: string) => {
    setAddingLang(true);
    setError(null);
    try {
      await apiAddLang(code);
      dispatch(addLanguageToList(code));
      setShowAddPicker(false);
      setSuccessMsg(`${codeToName(code)} added to your languages`);
    } catch (err: any) {
      setError(err.message ?? 'Failed to add language');
    } finally {
      setAddingLang(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ paddingBottom: 100 }}>
      {/* ── Header ── */}
      <div
        className="px-6 pt-12 pb-8"
        style={{ background: 'linear-gradient(135deg, #0E2954 0%, #153C70 100%)' }}
      >
        <h1
          className="text-2xl font-bold text-white flex items-center gap-3"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          {/* Settings gear inline SVG matches BottomNav icon */}
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Settings
        </h1>
        <p className="text-white/60 text-sm mt-1">Manage your language preferences</p>
      </div>

      <div className="px-6 pt-6 flex flex-col gap-8">

        {/* ── Error / success toast ── */}
        {error && (
          <div
            className="rounded-2xl px-4 py-3 text-sm font-medium"
            style={{ backgroundColor: '#FFF5F5', border: '2px solid #FEE2E2', color: '#991B1B', fontFamily: 'Inter, sans-serif' }}
          >
            {error}
          </div>
        )}
        {successMsg && (
          <div
            className="rounded-2xl px-4 py-3 text-sm font-medium"
            style={{ backgroundColor: '#D1FAE5', border: '2px solid #6EE7B7', color: '#065F46', fontFamily: 'Inter, sans-serif' }}
          >
            ✓ {successMsg}
          </div>
        )}

        {/* ── Native language ── */}
        <section>
          <label
            htmlFor="native-lang-select"
            className="block text-xs font-semibold mb-2 uppercase tracking-wide"
            style={{ color: '#718096', fontFamily: 'Poppins, sans-serif' }}
          >
            Your native language
          </label>
          <div style={{ position: 'relative' }}>
            <select
              id="native-lang-select"
              value={nativeLanguage}
              disabled={nativeLoading}
              onChange={e => handleNativeChange(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl text-sm outline-none cursor-pointer appearance-none"
              style={{
                border: '2px solid #E2E8F0',
                fontFamily: 'Inter, sans-serif',
                color: '#1A202C',
                backgroundColor: '#F4F7FB',
                opacity: nativeLoading ? 0.6 : 1,
                paddingRight: 40,
              }}
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {getFlag(lang.code)} {lang.name}
                </option>
              ))}
            </select>
            {/* Custom chevron */}
            <span
              style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#718096' }}
              aria-hidden
            >
              ▾
            </span>
          </div>
          {nativeLoading && (
            <p className="text-xs mt-1" style={{ color: '#718096', fontFamily: 'Inter, sans-serif' }}>Saving…</p>
          )}
        </section>

        {/* ── Learning languages ── */}
        <section>
          <p
            className="text-xs font-semibold mb-3 uppercase tracking-wide"
            style={{ color: '#718096', fontFamily: 'Poppins, sans-serif' }}
          >
            Languages you're learning
          </p>

          {loadingLanguages ? (
            <div className="flex items-center gap-2 py-2" style={{ color: '#718096' }}>
              <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25" /><path d="M21 12a9 9 0 00-9-9" /></svg>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13 }}>Loading languages…</span>
            </div>
          ) : (
            /* Horizontally scrollable pill row */
            <div
              role="list"
              aria-label="Your learning languages"
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 10,
                overflowX: 'auto',
                paddingBottom: 8,
                // Hide scrollbar but keep functionality
                scrollbarWidth: 'none',
              }}
            >
              {/* Language pills */}
              {learningLanguages.map(code => {
                const isActive = code === targetLanguage;
                const isSwitching = switchingTo === code;
                return (
                  <button
                    key={code}
                    role="listitem"
                    aria-label={`${codeToName(code)}${isActive ? ' (active)' : ' — click to switch'}`}
                    aria-pressed={isActive}
                    disabled={isActive || !!switchingTo}
                    onClick={() => handleSwitchActive(code)}
                    style={{
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '14px 18px',
                      borderRadius: 16,
                      border: isActive ? '2.5px solid #153C70' : '2px solid #E2E8F0',
                      backgroundColor: isActive ? '#153C70' : 'white',
                      cursor: isActive ? 'default' : 'pointer',
                      minWidth: 88,
                      boxShadow: isActive ? '0 4px 16px rgba(21,60,112,0.25)' : '0 2px 8px rgba(0,0,0,0.04)',
                      transition: 'all 0.2s ease',
                      opacity: isSwitching ? 0.6 : 1,
                    }}
                    onMouseEnter={e => {
                      if (isActive || switchingTo) return;
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#153C70';
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EEF2FA';
                    }}
                    onMouseLeave={e => {
                      if (isActive || switchingTo) return;
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0';
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'white';
                    }}
                  >
                    <span style={{ fontSize: 28, lineHeight: 1 }}>{getFlag(code)}</span>
                    <span
                      style={{
                        fontFamily: 'Poppins, sans-serif',
                        fontWeight: isActive ? 700 : 500,
                        fontSize: 12,
                        color: isActive ? 'white' : '#1A202C',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {codeToName(code)}
                    </span>
                    {isActive && (
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: 'Inter, sans-serif',
                          color: 'rgba(255,255,255,0.75)',
                          fontWeight: 500,
                          letterSpacing: '0.03em',
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Add language pill (dashed border, + icon) */}
              <button
                onClick={() => setShowAddPicker(true)}
                aria-label="Add a learning language"
                disabled={!!switchingTo || addingLang}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '14px 18px',
                  borderRadius: 16,
                  border: '2px dashed #CBD5E0',
                  backgroundColor: '#F4F7FB',
                  cursor: 'pointer',
                  minWidth: 88,
                  transition: 'all 0.2s ease',
                  opacity: (switchingTo || addingLang) ? 0.5 : 1,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#153C70';
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EEF2FA';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#CBD5E0';
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#F4F7FB';
                }}
              >
                <span style={{ fontSize: 24, color: '#718096', lineHeight: 1 }}>+</span>
                <span
                  style={{
                    fontFamily: 'Poppins, sans-serif',
                    fontWeight: 500,
                    fontSize: 12,
                    color: '#718096',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Add
                </span>
              </button>
            </div>
          )}

          {learningLanguages.length > 1 && !loadingLanguages && (
            <p className="text-xs mt-2" style={{ color: '#718096', fontFamily: 'Inter, sans-serif' }}>
              Tap a language pill to switch your active learning language.
            </p>
          )}
        </section>

        {/* ── App version info ── */}
        <section style={{ borderTop: '1px solid #E2E8F0', paddingTop: 24 }}>
          <p className="text-xs" style={{ color: '#A0AEC0', fontFamily: 'Inter, sans-serif' }}>
            LexiFlow · Language learning companion
          </p>
        </section>
      </div>

      {/* ── Add language picker modal ── */}
      {showAddPicker && (
        <AddLanguagePicker
          excludeCodes={learningLanguages}
          onSelect={handleAddLanguage}
          onClose={() => setShowAddPicker(false)}
          loading={addingLang}
        />
      )}
    </div>
  );
}
