SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'supported_languages'
) AS supported_languages_exists;

SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name = 'user_languages'
) AS user_languages_exists;

SELECT EXISTS (
  SELECT FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'words' AND column_name = 'target_language'
) AS words_target_language_exists;

SELECT EXISTS (
  SELECT FROM information_schema.columns 
  WHERE table_schema = 'public' AND table_name = 'review_queue' AND column_name = 'target_language'
) AS review_queue_target_language_exists;
