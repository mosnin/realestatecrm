-- PostgREST can only embed Contact from CallLog when an explicit foreign key
-- describes the relationship. Keep historical calls if a contact is deleted.
DO $$
BEGIN
  IF to_regclass('public."CallLog"') IS NOT NULL
     AND to_regclass('public."Contact"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'CallLog_contactId_fkey'
         AND conrelid = 'public."CallLog"'::regclass
     ) THEN
    ALTER TABLE "CallLog"
      ADD CONSTRAINT "CallLog_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL;
  END IF;
END
$$;
