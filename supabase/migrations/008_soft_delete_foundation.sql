-- 008_soft_delete_foundation.sql

ALTER TABLE profiles 
ADD COLUMN deleted_at timestamptz DEFAULT NULL,
ADD COLUMN deleted_reason text DEFAULT NULL,
ADD COLUMN deleted_by uuid DEFAULT NULL;

-- Future proofing
COMMENT ON COLUMN profiles.deleted_at IS 'Timestamp for soft deletion. If not null, the user is deactivated.';
