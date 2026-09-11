-- SOBDAI — Position V1 table ACL correction.
--
-- Migration 094 created the Position Entity schema and RLS policies but did
-- not grant the table privileges required to reach those policies. This
-- forward-only migration repairs only the table ACL; RLS remains authoritative.

grant select on table public.position_entities
    to anon;

grant select on table public.position_entities
    to authenticated;

grant insert, update, delete on table public.position_entities
    to authenticated;

-- Existing Sobdai server-side database conventions use explicit full CRUD
-- grants for service_role. This does not change browser-role RLS behavior.
grant select, insert, update, delete on table public.position_entities
    to service_role;

notify pgrst, 'reload schema';
