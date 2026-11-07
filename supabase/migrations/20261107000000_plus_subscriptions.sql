-- Familiar Plus: monthly subscription (Telegram Stars) that unlocks GIF search.
-- Written only by the telegram-webhook function; the app reads its own row.
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'plus' check (plan in ('plus')),
  expires_at timestamptz not null,
  telegram_user_id bigint,
  last_charge_id text,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

create policy "own subscription: read" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

-- Every Stars payment, so renewals and refunds can be traced (and a replayed update is a no-op).
create table public.payments (
  charge_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  telegram_user_id bigint not null,
  stars integer not null,
  recurring boolean not null default false,
  refunded boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
grant select, insert, update, delete on public.payments to service_role;
