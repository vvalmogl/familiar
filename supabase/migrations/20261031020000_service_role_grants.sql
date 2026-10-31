-- The service role (Edge Functions, admin scripts) also gets no table access by default.
-- It bypasses RLS, so these grants are what lets pack-download read the catalog and
-- lets publishing scripts and the future payment webhook write it.
grant select, insert, update, delete on public.packs to service_role;
grant select, insert, update, delete on public.entitlements to service_role;
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.user_settings to service_role;
