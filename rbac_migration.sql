-- ==========================================
-- A. MIGRATION SQL: UPDATE RBAC CONSTRAINT
-- ==========================================

-- 1. Drop existing check constraints on the 'role' column dynamically
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%role%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 2. Add the new expanded check constraint
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_role_check 
CHECK (role IN ('owner', 'admin', 'editor', 'support', 'user'));


-- ==========================================
-- B. EXAMPLE SQL: PROMOTE SPECIFIC USER TO OWNER
-- ==========================================

UPDATE public.profiles 
SET role = 'owner'
WHERE email = 'admin.sobdai@gmail.com';


-- ==========================================
-- C. VERIFICATION SQL: VIEW ROLE DISTRIBUTION
-- ==========================================

SELECT role, COUNT(*) as total_users
FROM public.profiles
GROUP BY role
ORDER BY total_users DESC;


-- ==========================================
-- D. VERIFICATION SQL: VERIFY OWNER EXISTS
-- ==========================================

SELECT id, email, role, created_at
FROM public.profiles
WHERE role = 'owner';
