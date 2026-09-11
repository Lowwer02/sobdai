-- SOBDAI — Position V1 table ACL normalization.
--
-- Production inherited broad table privileges before Position V1 was applied.
-- Normalize only the browser/server roles used by Position V1; owner/postgres
-- privileges, RLS, policies, RPC privileges, schema, and data are untouched.

revoke all privileges on table public.position_entities
    from anon, authenticated, service_role;

grant select on table public.position_entities
    to anon;

grant select, insert, update, delete on table public.position_entities
    to authenticated;

grant select, insert, update, delete on table public.position_entities
    to service_role;

notify pgrst, 'reload schema';
