import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from './store';
import { restoreSession } from './store/authSlice';
import { AppShell } from './components/layout/AppShell';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import OnboardingPage from './pages/Onboarding/OnboardingPage';
import LoginPage from './pages/Auth/LoginPage';
import SignUpPage from './pages/Auth/SignUpPage';
import ForgotPasswordPage from './pages/Auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/Auth/ResetPasswordPage';
import MasteryPage from './pages/Mastery/MasteryPage';
import VaultPage from './pages/Vault/VaultPage';
import VaultMonthPage from './pages/Vault/VaultMonthPage';
import VaultReadPage from './pages/Vault/VaultReadPage';
import WatchPage from './pages/Watch/WatchPage';
import WatchPlayerPage from './pages/Watch/WatchPlayerPage';
import ExplorePage from './pages/Explore/ExplorePage';
import PronouncePage from './pages/Pronounce/PronouncePage';
import LandingPage from './pages/Landing/LandingPage';
import PhonemeAssessmentPage from './pages/Pronounce/PhonemeAssessmentPage';
import SettingsPage from './pages/Settings/SettingsPage';

// ─── Session Loader ───────────────────────────────────────────────────────────
// Dispatches restoreSession on first render and shows a full-screen spinner
// while the check is in flight, preventing a flash-to-login for already-
// authenticated users.

function SessionLoader({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const authStatus = useAppSelector(s => s.auth.status);

  useEffect(() => {
    dispatch(restoreSession());
  }, [dispatch]);

  if (authStatus === 'idle') {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(160deg, #0E2954 0%, #153C70 60%, #1E4D99 100%)' }}
      >
        <LoadingSpinner size="lg" label="Loading…" />
      </div>
    );
  }

  return <>{children}</>;
}

// ─── Route Guards ─────────────────────────────────────────────────────────────

/**
 * Three-stage gate:
 * 1. Not authenticated → /auth/login
 * 2. Authenticated but not onboarded → /onboarding
 * 3. Authenticated + onboarded → render children (app)
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const authStatus = useAppSelector(s => s.auth.status);
  const onboarded = useAppSelector(s => s.user.onboarded);

  // Block until session restoration finishes — otherwise gated pages mount and
  // fire authenticated API calls before the Supabase client has a session token.
  if (authStatus === 'idle' || authStatus === 'loading') {
    return null;
  }
  if (authStatus === 'unauthenticated' || authStatus === 'error') {
    return <Navigate to="/auth/login" replace />;
  }
  if (!onboarded) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

/**
 * Redirects already-authenticated users away from auth pages back to the app.
 */
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const authStatus = useAppSelector(s => s.auth.status);
  const onboarded = useAppSelector(s => s.user.onboarded);

  if (authStatus === 'authenticated') {
    return <Navigate to={onboarded ? '/mastery' : '/onboarding'} replace />;
  }
  return <>{children}</>;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <SessionLoader>
        <Routes>
          {/* ── Landing page (public, redirect away if already signed in) ── */}
          <Route
            path="/"
            element={<RedirectIfAuthed><LandingPage /></RedirectIfAuthed>}
          />

          {/* ── Auth pages (public, redirect away if already signed in) ── */}
          <Route
            path="/auth/login"
            element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>}
          />
          <Route
            path="/auth/signup"
            element={<RedirectIfAuthed><SignUpPage /></RedirectIfAuthed>}
          />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

          {/* ── Onboarding (authenticated but not yet onboarded) ── */}
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* ── Main app (requires auth + onboarding) ── */}
          <Route element={<AppShell />}>
            <Route
              path="/mastery"
              element={<RequireAuth><MasteryPage /></RequireAuth>}
            />
            <Route
              path="/vault"
              element={<RequireAuth><VaultPage /></RequireAuth>}
            />
            <Route
              path="/vault/:month"
              element={<RequireAuth><VaultMonthPage /></RequireAuth>}
            />
            <Route
              path="/vault/:month/read"
              element={<RequireAuth><VaultReadPage /></RequireAuth>}
            />
            <Route
              path="/watch"
              element={<RequireAuth><WatchPage /></RequireAuth>}
            />
            <Route
              path="/watch/player/:videoId"
              element={<RequireAuth><WatchPlayerPage /></RequireAuth>}
            />
            <Route
              path="/explore"
              element={<RequireAuth><ExplorePage /></RequireAuth>}
            />
            <Route
              path="/settings"
              element={<RequireAuth><SettingsPage /></RequireAuth>}
            />
            {/* PRONOUNCE — TEMPORARILY DISABLED (SpeechSuper integration paused)
            Re-enable by restoring the two Route entries below and the nav item in BottomNav.tsx
            <Route
              path="/pronounce"
              element={<RequireAuth><PronouncePage /></RequireAuth>}
            />
            <Route
              path="/pronounce/:phonemeId"
              element={<RequireAuth><PhonemeAssessmentPage /></RequireAuth>}
            />
            */}
            <Route path="*" element={<Navigate to="/mastery" replace />} />
          </Route>
        </Routes>
      </SessionLoader>
    </BrowserRouter>
  );
}

// Suppress unused-import warnings for the disabled Pronounce pages
// (kept in imports so re-enabling is a single uncomment)
void PronouncePage;
void PhonemeAssessmentPage;
