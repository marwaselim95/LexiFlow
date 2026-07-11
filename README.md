# LexiFlow

A neuro-based language learning PWA built with React, Redux Toolkit, Tailwind CSS, and React Router.

## Quick Start

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

---

## Backend Integration Points

All data flows through `/src/services/api/mockApi.ts` and `/src/services/api/auth.ts`. To connect the real Supabase/edge-function backend, replace **each function body** with the real implementation. Function signatures **must not change** — the entire component tree depends on them.

### Authentication (`/src/services/api/auth.ts` → Supabase Auth JS client)

| Function | Description | Real implementation |
|---|---|---|
| `signUp` | Create a new user account | `supabase.auth.signUp({ email, password })` |
| `signIn` | Sign an existing user in | `supabase.auth.signInWithPassword({ email, password })` |
| `signOut` | End the current session | `supabase.auth.signOut()` |
| `requestPasswordReset` | Send a password reset email | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` |
| `confirmPasswordReset` | Set new password from reset token | `supabase.auth.updateUser({ password })` |
| `restoreSession` | Rehydrate an existing session on app load | `supabase.auth.getSession()` |

### App Data (`/src/services/api/mockApi.ts` → Supabase edge functions)

| Function | Description | Backend target |
|---|---|---|
| `generateDetailCard` | Generate full/simplified/too_long card from text | Gemini edge function |
| `checkTypos` | Spell-check input text | Gemini edge function |
| `translateExplanations` | Translate context explanations to native language | Gemini edge function |
| `assessPronunciation` | Assess recorded audio against a target word | SpeechSuper API via Supabase function |
| `saveWord` | Persist a word to user's vault | Supabase insert (words table) |
| `removeWord` | Remove a word from user's vault | Supabase delete |
| `getMasterySession` | Get today's SRS review queue (cap: 50) | Supabase SRS query |
| `submitAnswer` | Submit review answer and update SRS stage | Supabase SRS update |
| `getVaultMonths` | Get list of months with saved word counts | Supabase aggregation query |
| `getVaultWords` | Get all words saved in a given month | Supabase query |
| `generateVaultParagraph` | Generate a paragraph using month's saved words | Gemini edge function |
| `getSuggestedVideos` | Get personalized video recommendations | Recommendation engine / Supabase function |
| `validateVideoUrl` | Check if a YouTube URL is in target language | YouTube Data API |
| `getVideoCaptions` | Fetch captions/subtitles for a YouTube video | YouTube Captions API |
| `getExploreSuggestions` | Get AI-suggested vocabulary cards | Gemini edge function |
| `searchExplore` | Search vocabulary by text in native/target language | Gemini edge function |
| `getPhonemeList` | Get list of target-language phonemes with status | Supabase query |
| `getWordForPhoneme` | Get a word containing a specific phoneme for practice | Supabase/Gemini lookup |

---

## Architecture

```
src/
  services/api/
    types.ts          ← All shared TypeScript interfaces (DetailCardData, ReviewItem, etc.)
    mockApi.ts        ← 19 mock implementations (REPLACE these with real calls)
  store/
    index.ts          ← Redux store configuration
    userSlice.ts      ← nativeLanguage, targetLanguage, onboarded
    wordsSlice.ts     ← Normalized word dictionary
    detailCardSlice.ts← DetailCard UI state machine
    masterySessionSlice.ts ← SRS review session
    vaultSlice.ts     ← Vault months + words + read session
    watchSlice.ts     ← Video suggestions + captions + session words
    exploreSlice.ts   ← Explore feed + search
    pronounceSlice.ts ← Phoneme list + assessment flow
    uiSlice.ts        ← Bee icon + toasts + add-word FAB
  components/
    layout/           ← AppShell, BottomNav
    common/           ← BeeIcon, Toast, LoadingSpinner, EmptyState
    DetailCard/       ← Full DetailCard component tree (8 sub-states)
    PronunciationRecorder/ ← Web Audio API mic recorder
    YouTubePlayer/    ← Real YouTube IFrame API integration
  pages/              ← One folder per section
  hooks/
    useApiCall.ts     ← Standardized async state hook
    useTextSelection.ts ← Global text selection → bee icon
```

## Design System

See `design.md` for full token reference. All CSS variables are in `src/index.css`.

- Primary Blue: `#153C70`
- Font: Poppins (headings) + Inter (body)
- Cards: 16–24px border radius
- Buttons: pill-shaped (9999px)
# Team members

Lead Technical Architect: Marwa Ahmed Mohamed Selim
Presentation and feasilbity report: Noor Ayman Mohamed
QA and Testing: Aisha Mahmoud Abdelwareth
Market analysis and GTM: Shahd Medhat Arafagit push -u nha-repo main