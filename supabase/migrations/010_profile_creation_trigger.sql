-- ============================================================
-- Migration 010: Auto-create profile on user signup
-- ============================================================
-- Adds a Postgres trigger on auth.users that automatically
-- creates a profiles row and a user_languages row when a new
-- user signs up. This fills a pre-existing gap where no
-- mechanism existed to populate these tables.
--
-- The signup flow does not currently collect language preferences
-- (that's handled post-signup in the onboarding page, which only
-- writes to localStorage). So defaults are used:
--   native_language = 'en', target_language = 'en'
-- Both are valid codes in supported_languages (seeded in 009).
-- The future UI/onboarding session will update these via
-- setActiveLanguage / updateNativeLanguage edge functions.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile with defaults (or from metadata if provided)
  INSERT INTO public.profiles (id, native_language, target_language, onboarded)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'native_language', 'en'),
    COALESCE(NEW.raw_user_meta_data->>'target_language', 'en'),
    false
  );

  -- Also seed user_languages so language-scoped queries
  -- (getMasterySession, getVaultWords, etc.) work immediately
  INSERT INTO public.user_languages (user_id, language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'target_language', 'en')
  );

  RETURN NEW;
END;
$$;

-- Fire only on INSERT (new signups), not UPDATE
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
