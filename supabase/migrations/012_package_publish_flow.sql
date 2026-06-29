-- 012_package_publish_flow.sql
-- Add is_published to packages if it does not exist

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'packages' 
          AND column_name = 'is_published'
    ) THEN
        ALTER TABLE public.packages 
        ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;
