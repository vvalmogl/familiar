-- Familiar: optional accounts, settings sync, character pack gallery (free now, paid later).

-- ───────────── profiles ─────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "own profile: read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "own profile: update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- A profile row appears on sign-up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), 60));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────── settings sync ─────────────
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 64 * 1024),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;

create policy "own settings: read" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own settings: insert" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own settings: update" on public.user_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ───────────── pack catalog ─────────────
create table public.packs (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9._-]{1,63}$'),
  name text not null check (char_length(name) <= 60),
  author text not null check (char_length(author) <= 60),
  description text check (char_length(description) <= 500),
  license text not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  preview_url text,
  -- Object path in storage: bucket `packs-free` when price is 0, `packs-paid` otherwise.
  file_path text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 50 * 1024 * 1024),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.packs enable row level security;

-- Anyone (signed in or not) can browse published packs; only the service role writes.
create policy "published packs are public" on public.packs
  for select to anon, authenticated using (published);

-- ───────────── purchases (filled by the payment webhook later) ─────────────
create table public.entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_id text not null references public.packs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);
alter table public.entitlements enable row level security;

create policy "own entitlements: read" on public.entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

-- ───────────── storage ─────────────
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('packs-free', 'packs-free', true, 50 * 1024 * 1024),
  ('packs-paid', 'packs-paid', false, 50 * 1024 * 1024)
on conflict (id) do nothing;
-- No storage.objects policies: uploads go through the service role; paid files are only
-- reachable through signed URLs minted by the `pack-download` function.
