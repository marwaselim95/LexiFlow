import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store';
import { openAddWord, closeAddWord, setAddWordText } from '../../store/uiSlice';
import { useDetailCardFlow } from '../DetailCard/useDetailCardFlow';
import { signOut } from '../../store/authSlice';
import logoUrl from '../../assets/lexi_logo.svg';

// ─── Outline SVG Icons ────────────────────────────────────────────────────────

function IconMastery({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3C8.13 3 5 6.13 5 10c0 2.38 1.19 4.47 3 5.74V17a1 1 0 001 1h6a1 1 0 001-1v-1.26C17.81 14.47 19 12.38 19 10c0-3.87-3.13-7-7-7z" />
      <path d="M9 21h6" />
      <path d="M10 17v4" />
      <path d="M14 17v4" />
    </svg>
  );
}

function IconVault({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
      <path d="M7 6h.01" />
      <path d="M12 6h.01" />
    </svg>
  );
}

function IconWatch({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconExplore({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
      <path d="M11 8v3l2 2" />
    </svg>
  );
}

function IconPronounce({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0" />
      <path d="M12 19v3" />
      <path d="M9 22h6" />
    </svg>
  );
}

function IconSettings({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

// ─── Nav Items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/mastery', Icon: IconMastery, label: 'Mastery' },
  { to: '/vault', Icon: IconVault, label: 'Vault' },
  { to: '/watch', Icon: IconWatch, label: 'Watch' },
  { to: '/explore', Icon: IconExplore, label: 'Explore' },
  // PRONOUNCE — TEMPORARILY DISABLED (SpeechSuper integration paused)
  // Re-enable by uncommenting the line below and restoring the routes in App.tsx
  // { to: '/pronounce', Icon: IconPronounce, label: 'Pronounce' },
];

// ─── Hamburger Icon ───────────────────────────────────────────────────────────

function HamburgerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const SIDEBAR_COLLAPSED_W = 72;
const SIDEBAR_EXPANDED_W = 248;

// Mobile scales everything to 50%
const MOBILE_SCALE = 0.5;

export function BottomNav({ isOpen, onToggle }: SidebarProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { addWordInputOpen, addWordText } = useAppSelector(s => s.ui);
  const { triggerCardOpen } = useDetailCardFlow();

  const [isMobile, setIsMobile] = React.useState(
    () => window.matchMedia('(max-width: 767px)').matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Scale factor: 1 on desktop, 0.5 on mobile
  const sc = isMobile ? MOBILE_SCALE : 1;

  const collapsedW = SIDEBAR_COLLAPSED_W * sc;       // 36 | 72
  const expandedW = SIDEBAR_EXPANDED_W * sc;       // 124 | 248
  const w = isOpen ? expandedW : collapsedW;

  const btnSize = Math.round(40 * sc);            // 20 | 40
  const iconSize = Math.round(20 * sc);            // 10 | 20
  const hamburgerSize = Math.round(18 * sc);            // 9  | 18
  const plusFontSize = Math.round(22 * sc);            // 11 | 22
  const logoFontSize = Math.round(22 * sc);            // 11 | 22
  const logoHeight = Math.round(48 * sc);              // 24 | 48
  const navFontSize = Math.round(14 * sc);            // 7  | 14
  const navGap = Math.round(14 * sc);            // 7  | 14
  const headerMinH = Math.round(68 * sc);            // 34 | 68

  const headerPadOpen = isMobile ? '10px 8px 8px 10px' : '20px 16px 16px 20px';
  const headerPadClosed = isMobile ? '10px 0 8px' : '20px 0 16px';
  const addPad = isMobile ? '8px 8px 4px 8px' : '16px 16px 8px 16px';
  const navPad = isMobile ? '4px 4px 0' : '8px 12px 0';
  const navItemPad = isMobile ? '6px 7px' : '11px 14px';

  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: isOpen ? 200 : 50,
        width: w,
        backgroundColor: '#FFFFFF',
        boxShadow: '4px 0 24px rgba(21,60,112,0.10)',
        borderRadius: '0 20px 20px 0',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.38s cubic-bezier(0.25, 0.8, 0.25, 1)',
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isOpen ? 'space-between' : 'center',
          padding: isOpen ? headerPadOpen : headerPadClosed,
          borderBottom: '1px solid #E2E8F0',
          minHeight: headerMinH,
          flexShrink: 0,
          transition: 'padding 0.38s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        {/* Logo text — smoothly morphs in/out */}
        <span
          style={{
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 700,
            fontSize: logoFontSize,
            color: '#153C70',
            letterSpacing: '-0.5px',
            whiteSpace: 'nowrap',
            opacity: isOpen ? 1 : 0,
            maxWidth: isOpen ? 160 : 0,
            overflow: 'hidden',
            transform: isOpen ? 'translateX(0)' : 'translateX(-8px)',
            transition: 'opacity 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), max-width 0.38s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.38s cubic-bezier(0.25, 0.8, 0.25, 1)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <img src={logoUrl} alt="Lexi Logo" style={{ height: logoHeight, width: 'auto', objectFit: 'contain' }} />
        </span>

        {/* Hamburger toggle button */}
        <button
          onClick={onToggle}
          aria-label={isOpen ? 'Collapse navigation' : 'Expand navigation'}
          style={{
            width: btnSize,
            height: btnSize,
            borderRadius: '50%',
            backgroundColor: '#153C70',
            border: '2.5px solid white',
            boxShadow: '0 3px 12px rgba(21,60,112,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'white',
            flexShrink: 0,
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 5px 20px rgba(21,60,112,0.45)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 3px 12px rgba(21,60,112,0.28)';
          }}
        >
          <HamburgerIcon size={hamburgerSize} />
        </button>
      </div>

      {/* ── Add Word Button ── */}
      <div
        style={{
          padding: addPad,
          display: 'flex',
          justifyContent: 'flex-start',
          flexShrink: 0,
          transition: 'padding 0.38s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        <button
          onClick={() => dispatch(openAddWord())}
          aria-label="Add a word"
          style={{
            width: btnSize,
            height: btnSize,
            borderRadius: '50%',
            backgroundColor: '#153C70',
            color: 'white',
            border: '2.5px solid white',
            boxShadow: '0 3px 12px rgba(21,60,112,0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: plusFontSize,
            fontWeight: 300,
            lineHeight: 1,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 5px 20px rgba(21,60,112,0.4)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 3px 12px rgba(21,60,112,0.22)';
          }}
        >
          +
        </button>

        {/* "Add" label — smoothly morphs in/out */}
        <span
          style={{
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 600,
            fontSize: navFontSize,
            color: '#153C70',
            marginLeft: isOpen ? 14 : 0,
            alignSelf: 'center',
            whiteSpace: 'nowrap',
            opacity: isOpen ? 1 : 0,
            maxWidth: isOpen ? 80 : 0,
            overflow: 'hidden',
            transform: isOpen ? 'translateX(0)' : 'translateX(-8px)',
            transition: 'opacity 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), max-width 0.38s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.38s cubic-bezier(0.25, 0.8, 0.25, 1), margin-left 0.38s cubic-bezier(0.25, 0.8, 0.25, 1)',
          }}
        >
          Add
        </span>
      </div>

      {/* ── Floating Add-Word Input ── */}
      {addWordInputOpen && (
        <div
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-3 py-2 rounded-full shadow-xl"
          style={{ background: 'white', border: '2px solid #153C70', minWidth: 280 }}
        >
          <input
            autoFocus
            value={addWordText}
            onChange={e => dispatch(setAddWordText(e.target.value))}
            onKeyDown={e => {
              if (e.key === 'Enter' && addWordText.trim()) {
                dispatch(closeAddWord());
                triggerCardOpen(addWordText.trim());
              }
              if (e.key === 'Escape') dispatch(closeAddWord());
            }}
            placeholder="Type a word or phrase…"
            className="flex-1 text-sm outline-none bg-transparent"
            style={{ fontFamily: 'Inter, sans-serif', color: '#1A202C' }}
          />
          <button
            onClick={() => {
              if (addWordText.trim()) {
                dispatch(closeAddWord());
                triggerCardOpen(addWordText.trim());
              }
            }}
            aria-label="Look up word"
            className="text-xl"
          >
            🐝
          </button>
          <button
            onClick={() => dispatch(closeAddWord())}
            aria-label="Close"
            className="text-base"
            style={{ color: '#718096' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Nav Items ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          padding: navPad,
          alignItems: 'stretch',
          transition: 'padding 0.38s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        {NAV_ITEMS.map(({ to, Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            className={({ isActive }) => 
              `transition-all duration-200 ease-in-out rounded-xl ${!isActive ? 'hover:bg-slate-100' : ''}`
            }
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: navGap,
              padding: navItemPad,
              width: '100%',
              justifyContent: 'flex-start',
              textDecoration: 'none',
              fontFamily: 'Poppins, sans-serif',
              fontSize: navFontSize,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? '#153C70' : '#718096',
              backgroundColor: isActive ? '#EEF2FA' : undefined,
              borderLeft: isOpen && isActive ? '3px solid #153C70' : '3px solid transparent',
              position: 'relative',
            })}
          >
            {({ isActive }) => (
              <>
                <span
                  style={{
                    color: isActive ? '#153C70' : '#A0AEC0',
                    flexShrink: 0,
                    transition: 'color 0.18s',
                    position: 'relative',
                  }}
                >
                  {/* Collapsed active indicator — left border pill */}
                  {!isOpen && isActive && (
                    <span
                      style={{
                        position: 'absolute',
                        left: -10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 3,
                        height: 24,
                        borderRadius: 9999,
                        backgroundColor: '#153C70',
                      }}
                    />
                  )}
                  <Icon size={iconSize} />
                </span>
                <span
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    opacity: isOpen ? 1 : 0,
                    maxWidth: isOpen ? 160 : 0,
                    transform: isOpen ? 'translateX(0)' : 'translateX(-8px)',
                    transition: 'opacity 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), max-width 0.38s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.38s cubic-bezier(0.25, 0.8, 0.25, 1)',
                  }}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
      {/* ── Settings + Sign out ── */}
      <div
        style={{
          padding: navPad,
          paddingBottom: isMobile ? 8 : 16,
          flexShrink: 0,
        }}
      >
        {/* Settings button — same structure as sign-out, neutral hover colors */}
        <button
          onClick={() => navigate('/settings')}
          aria-label="Settings"
          title="Settings"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: navGap,
            padding: navItemPad,
            width: '100%',
            justifyContent: 'flex-start',
            borderRadius: 12,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontFamily: 'Poppins, sans-serif',
            fontSize: navFontSize,
            fontWeight: 500,
            color: '#718096',
            transition: 'all 0.18s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EEF2FA'; (e.currentTarget as HTMLButtonElement).style.color = '#153C70'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#718096'; }}
        >
          <span style={{ color: 'inherit', flexShrink: 0 }}>
            <IconSettings size={iconSize} />
          </span>
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              opacity: isOpen ? 1 : 0,
              maxWidth: isOpen ? 160 : 0,
              transform: isOpen ? 'translateX(0)' : 'translateX(-8px)',
              transition: 'opacity 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), max-width 0.38s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.38s cubic-bezier(0.25, 0.8, 0.25, 1)',
            }}
          >
            Settings
          </span>
        </button>
        <button
          onClick={async () => {
            await dispatch(signOut());
            navigate('/auth/login');
          }}
          aria-label="Sign out"
          title="Sign out"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: navGap,
            padding: navItemPad,
            width: '100%',
            justifyContent: 'flex-start',
            borderRadius: 12,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontFamily: 'Poppins, sans-serif',
            fontSize: navFontSize,
            fontWeight: 500,
            color: '#718096',
            transition: 'all 0.18s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FEE2E2'; (e.currentTarget as HTMLButtonElement).style.color = '#991B1B'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#718096'; }}
        >
          {/* Sign-out icon */}
          <span style={{ color: 'inherit', flexShrink: 0 }}>
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              opacity: isOpen ? 1 : 0,
              maxWidth: isOpen ? 160 : 0,
              transform: isOpen ? 'translateX(0)' : 'translateX(-8px)',
              transition: 'opacity 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), max-width 0.38s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.38s cubic-bezier(0.25, 0.8, 0.25, 1)',
            }}
          >
            Sign out
          </span>
        </button>
      </div>

      {/* Footer spacer */}
      <div style={{ height: 8, flexShrink: 0 }} />
    </nav>
  );
}

// Export constants so AppShell can use them for layout offset
export { SIDEBAR_COLLAPSED_W, SIDEBAR_EXPANDED_W };
