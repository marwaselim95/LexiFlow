-- One-time migration: invalidate cached MCQ questions for types 1 and 2
-- so they are regenerated with the fixed prompts on next fetch.
-- This does NOT affect question types 3–6.
UPDATE review_queue
SET    current_mcq = NULL
WHERE  question_type IN (1, 2);
