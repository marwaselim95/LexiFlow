# LexiFlow

A neuro-based language learning PWA — master vocabulary through spaced repetition, immersive YouTube-based watching, AI-generated vocabulary cards, and contextual example-driven learning.

Built with React, Redux Toolkit, Tailwind CSS, React Router, and Supabase (Auth, Postgres, Edge Functions).


---

## Quick Start

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

### Environment Variables

Create a `.env.local` file in the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Supabase Edge Functions additionally require their own secrets (Gemini/Groq API key, YouTube Data API key, SpeechSuper credentials, etc.) configured via `supabase secrets set` or the Supabase dashboard — see **Backend / Edge Functions** below.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

---

## Features

### 🐝 Word Lookup (Bee Icon + DetailCard)
Select any text anywhere in the app to trigger an AI-generated vocabulary card: definitions across multiple contexts, native-language synonyms, example sentences, pronunciation (via YouGlish), and one-tap saving. Handles typo correction, overly-long selections, and multi-word phrases gracefully.

### 🧠 Mastery (Spaced Repetition)
A daily review queue driven by a 6-stage SRS algorithm (Postgres RPC-based scheduling). Six question types: multiple choice, reversed multiple choice, listen-and-write, fill-in-the-blanks, nuanced usage, and open production — the latter two graded by AI.

### 📚 Vault
Saved words organized by month. Includes a "Read" mode that generates an AI paragraph using that month's saved vocabulary, with saved words highlighted and tappable for review.

### 📺 Watch
Search for or paste a YouTube video in your target language. Captions are scraped/cached server-side (InnerTube API with watch-page-scraping fallback) and displayed alongside the video, synced to playback. Select any caption text to look it up instantly.

### 🧭 Explore
AI-suggested vocabulary based on your saved words, plus free-text search in either your native or target language that returns a cluster of related vocabulary cards.

### 🎤 Pronounce *(currently disabled)*
Phoneme-level pronunciation assessment via SpeechSuper. Temporarily paused — see `THRESHOLDS.md` and inline `PRONOUNCE — TEMPORARILY DISABLED` comments in the codebase for re-enabling instructions.

### 🌍 Multi-Language Support
Users can learn multiple target languages, switch the active one from Settings, and add new languages on the fly. 24 supported languages (see `supabase/migrations/009_multi_language_support.sql`).

### 🔐 Auth
Full email/password flow via Supabase Auth: sign up, log in, forgot/reset password, session persistence and restoration.

### 📱 PWA
Installable as a standalone app via `vite-plugin-pwa`, with offline asset caching.

---

## Project Structure

```
src/
  components/
    DetailCard/       ← Word lookup card (8 sub-states: loading, editing, full, watch view, etc.)
    PronunciationRecorder/  ← Web Audio API mic recorder (currently unused — Pronounce disabled)
    YouTubePlayer/     ← Custom YouTube IFrame API player with synced captions
    layout/            ← AppShell, collapsible sidebar nav
    common/            ← Toast, LoadingSpinner, EmptyState, BeeIcon
  pages/               ← One folder per app section (Auth, Mastery, Vault, Watch, Explore, Settings, Onboarding, Landing)
  store/               ← Redux Toolkit slices (auth, user, words, detailCard, mastery, vault, watch, explore, ui)
  services/api/
    types.ts           ← Shared TypeScript interfaces
    mockApi.ts         ← Live Supabase client wrappers (despite the name — fully wired to production)
    auth.ts             ← Supabase Auth wrappers
  hooks/               ← useApiCall, useTextSelection

supabase/
  functions/           ← Edge Functions (Deno) — one folder per function, plus _shared/ utilities
  migrations/          ← Sequential SQL migrations (schema, RPCs, multi-language support, etc.)
```

---

## Backend / Edge Functions

All AI and third-party integrations run server-side as Supabase Edge Functions (Deno), never exposing API keys to the client.

| Function | Purpose |
|---|---|
| `generateDetailCard` | Generate a full/simplified vocabulary card from selected text |
| `checkTypos` | Spell-check before card generation |
| `translateExplanations` | Translate context explanations into the user's native language |
| `saveWord` / `removeWord` | Vault CRUD |
| `getMasterySession` / `submitAnswer` | SRS review queue + answer grading (with AI-graded question types) |
| `getVaultMonths` / `getVaultWords` / `generateVaultParagraph` | Vault browsing and AI reading-paragraph generation |
| `getSuggestedVideos` / `validateVideoUrl` / `getVideoCaptions` | YouTube search, validation, and caption scraping/caching |
| `getExploreSuggestions` / `searchExplore` | AI vocabulary discovery |
| `getPhonemeList` / `getWordForPhoneme` / `assessPronunciation` | Pronounce feature (currently disabled) |
| `getLearningLanguages` / `addLearningLanguage` / `setActiveLanguage` / `updateNativeLanguage` | Multi-language management |
| `backfillCategories` | One-time maintenance script for watch-history category normalization |

Shared utilities (`supabase/functions/_shared/`) handle CORS, error normalization, rate limiting, the AI provider client (Groq primary, OpenRouter fallback), Levenshtein-based typo tolerance, and script-contamination detection for AI output.

AI provider: **Groq** (`llama-3.3-70b-versatile`) is primary; falls back to OpenRouter if configured. See `supabase/functions/_shared/gemini.ts` (name is legacy — no longer Gemini-specific).

Full endpoint-by-endpoint behavior and tunable constants (rate limits, typo tolerance thresholds, cold-start thresholds, etc.) are documented in `THRESHOLDS.md`.

---

## Database

Postgres schema, RLS policies, and SRS scheduling logic live in `supabase/migrations/`, applied sequentially. Key pieces:

- `profiles`, `words`, `word_contexts`, `review_queue`, `review_history` — core learning data, all RLS-scoped to `auth.uid()`
- `schedule_review()` / `on_answer()` — transactional Postgres RPCs driving the spaced-repetition state machine
- `supported_languages` / `user_languages` — multi-language support (added in migration 009)
- `video_captions` — server-side caption cache (service-role only)
- A trigger on `auth.users` auto-provisions `profiles` and `user_languages` on signup

---

## Deployment

- **Frontend**: Deployed on Vercel, auto-deploying from the `main` branch of this GitHub repo. Every PR gets an automatic preview deployment link via Vercel's GitHub integration.
- **Backend**: Supabase project hosts the Postgres database and all Edge Functions (deployed via `supabase functions deploy`).

---

## Design System

See `design.md` for the full token reference (colors, typography, spacing, border-radius scale). Implemented as CSS custom properties in `src/index.css`.

- Primary Blue: `#153C70`
- Fonts: Poppins (headings) · Inter (body)
- Cards: 16–24px border radius · Buttons: pill-shaped

---


## Ownership & Access

This project — the GitHub repository, Supabase project, and Vercel deployment — is owned and administered by Marwa Ahmed Mohamed Selim. Infrastructure, billing, and admin access are kept under this single account across all three platforms.

---

## Team

- **Lead Technical Architect**: Marwa Ahmed Mohamed Selim
