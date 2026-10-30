-- New Supabase projects don't grant table access to API roles by default.
-- Grant only what the app uses; RLS policies still decide which rows are visible.

grant select on public.packs to anon, authenticated;

grant select, update (display_name) on public.profiles to authenticated;

grant select, insert, update on public.user_settings to authenticated;

grant select on public.entitlements to authenticated;
