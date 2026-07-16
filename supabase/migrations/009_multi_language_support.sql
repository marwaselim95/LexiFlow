-- ============================================================
-- Migration 009: Multi-language support
-- ============================================================
-- Adds support for multiple target languages per user, with one
-- "active" language at a time. Creates a supported_languages
-- reference table, a user_languages junction table, and adds
-- target_language columns to words and review_queue.
-- ============================================================

-- ── Step 1: supported_languages reference table ──────────────────
-- Public reference data — no RLS needed.
CREATE TABLE supported_languages (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT INTO supported_languages (code, name) VALUES
  ('ar', 'Arabic'),
  ('zh', 'Chinese'),
  ('nl', 'Dutch'),
  ('en', 'English'),
  ('fr', 'French'),
  ('de', 'German'),
  ('el', 'Greek'),
  ('he', 'Hebrew'),
  ('hi', 'Hindi'),
  ('id', 'Indonesian'),
  ('it', 'Italian'),
  ('ja', 'Japanese'),
  ('ko', 'Korean'),
  ('fa', 'Persian'),
  ('pl', 'Polish'),
  ('pt', 'Portuguese'),
  ('ro', 'Romanian'),
  ('ru', 'Russian'),
  ('es', 'Spanish'),
  ('sv', 'Swedish'),
  ('th', 'Thai'),
  ('tr', 'Turkish'),
  ('uk', 'Ukrainian'),
  ('vi', 'Vietnamese');

-- Grant read access so edge functions and clients can query the list
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.supported_languages
  TO authenticated, anon;

-- ── Step 2: Update profiles.target_language constraint ───────────
-- Drop the old ('en','fr') check constraint and replace with an FK
-- to the full 24-language reference table.
ALTER TABLE profiles DROP CONSTRAINT profiles_target_language_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_target_language_fk
  FOREIGN KEY (target_language) REFERENCES supported_languages(code);

-- ── Step 3: user_languages table ─────────────────────────────────
-- Tracks every language a user is learning. One row per language.
CREATE TABLE user_languages (
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL REFERENCES supported_languages(code),
  added_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, language)
);

ALTER TABLE user_languages ENABLE ROW LEVEL SECURITY;

-- RLS: same pattern as words table (auth.uid() = user_id)
CREATE POLICY "users manage own languages" ON user_languages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.user_languages
  TO authenticated, anon;

-- ── Step 4: Seed user_languages from existing profiles ───────────
-- Every existing user's current target_language becomes their first
-- user_languages entry, so no one loses their existing progress.
INSERT INTO user_languages (user_id, language)
SELECT id, target_language FROM profiles
WHERE target_language IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── Step 5: Add target_language to words ─────────────────────────
ALTER TABLE words ADD COLUMN target_language TEXT;

-- Backfill: set each word's language from its owner's profile.
-- Existing users only ever had one target language, so this is
-- unambiguous.
UPDATE words w
SET target_language = p.target_language
FROM profiles p
WHERE w.user_id = p.id;

-- Orphan guard: fail loudly with a clear message instead of a
-- cryptic NOT NULL constraint error if any words lack a profile.
DO $$
DECLARE orphan_count int;
BEGIN
  SELECT count(*) INTO orphan_count FROM words WHERE target_language IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % words have no matching profile for target_language backfill', orphan_count;
  END IF;
END $$;

ALTER TABLE words ALTER COLUMN target_language SET NOT NULL;

ALTER TABLE words
  ADD CONSTRAINT words_target_language_fk
  FOREIGN KEY (target_language) REFERENCES supported_languages(code);

-- Composite index for language-scoped queries.
-- Queries will now filter by (user_id, target_language) everywhere.
CREATE INDEX idx_words_user_language ON words (user_id, target_language);

-- ── Step 6: Add target_language to review_queue ──────────────────
ALTER TABLE review_queue ADD COLUMN target_language TEXT;

-- Backfill: derive from the word's language (which was just set above).
UPDATE review_queue rq
SET target_language = w.target_language
FROM words w
WHERE rq.word_id = w.id;

-- Orphan guard for review_queue
DO $$
DECLARE orphan_count int;
BEGIN
  SELECT count(*) INTO orphan_count FROM review_queue WHERE target_language IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % review_queue rows have no matching word for target_language backfill', orphan_count;
  END IF;
END $$;

ALTER TABLE review_queue ALTER COLUMN target_language SET NOT NULL;

ALTER TABLE review_queue
  ADD CONSTRAINT review_queue_target_language_fk
  FOREIGN KEY (target_language) REFERENCES supported_languages(code);

-- Replace the existing hot index with one that includes language,
-- since getMasterySession will now filter by language too.
DROP INDEX IF EXISTS idx_review_queue_hot;
CREATE INDEX idx_review_queue_hot
  ON review_queue (user_id, target_language, status, scheduled_for);

-- ── Step 7: Update schedule_review RPC ───────────────────────────
-- The original function inserts into review_queue without
-- target_language, which is now NOT NULL. Update it to copy the
-- word's target_language into the new review_queue row.
CREATE OR REPLACE FUNCTION schedule_review(p_word_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_word        words%rowtype;
  v_delay       interval;
  v_qtype       int;
BEGIN
  SELECT * INTO v_word FROM words WHERE id = p_word_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'word not found: %', p_word_id;
  END IF;

  -- Delay intervals per stage
  v_delay := CASE v_word.stage
    WHEN 1 THEN interval '3 hours'
    WHEN 2 THEN interval '1 day'
    WHEN 3 THEN interval '3 days'
    WHEN 4 THEN interval '1 week'
    WHEN 5 THEN interval '3 weeks'
    WHEN 6 THEN interval '2 months'
    ELSE        interval '1 day'
  END;

  -- Question type mirrors the stage number exactly
  v_qtype := v_word.stage;

  INSERT INTO review_queue (user_id, word_id, scheduled_for, question_type, status, target_language)
  VALUES (v_word.user_id, p_word_id, now() + v_delay, v_qtype, 'pending', v_word.target_language);
END;
$$;
