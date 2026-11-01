-- Nigeria Market Atlas · Community price agents
-- Runs in the same Supabase project as LARA (shared sign-in), in its own ma_* tables.
-- Safe to run more than once.

-- ---------------------------------------------------------------- tables
create table if not exists public.ma_agents (
  id          uuid primary key references auth.users(id) on delete cascade,
  handle      text not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name        text not null check (char_length(name) between 2 and 80),
  market_id   text,                                   -- id from the atlas market list, or null for a market not on the map
  market_name text not null check (char_length(market_name) between 2 and 120),
  state       text not null check (char_length(state) between 2 and 40),
  lga         text check (char_length(lga) <= 60),
  bio         text check (char_length(bio) <= 400),
  links       jsonb not null default '{}'::jsonb,     -- optional public profile links {linkedin, facebook}
  trusted     boolean not null default false,         -- set by the atlas editor only
  suspended   boolean not null default false,         -- set by the atlas editor only
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.ma_posts (
  id          bigint generated always as identity primary key,
  agent_id    uuid not null references public.ma_agents(id) on delete cascade,
  market_id   text,
  market_name text not null check (char_length(market_name) between 2 and 120),
  state       text not null,
  lga         text,
  observed_on date not null default current_date,
  note        text check (char_length(note) <= 300),
  status      text not null default 'live' check (status in ('live','removed')),
  created_at  timestamptz not null default now()
);
create index if not exists ma_posts_agent_idx on public.ma_posts (agent_id, observed_on desc);
create index if not exists ma_posts_recent_idx on public.ma_posts (observed_on desc, id desc);

create table if not exists public.ma_prices (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.ma_posts(id) on delete cascade,
  agent_id    uuid not null references public.ma_agents(id) on delete cascade,
  commodity   text not null check (char_length(commodity) between 2 and 40),  -- atlas key (maize, ricel …) or 'other'
  item        text check (char_length(item) <= 60),                           -- name when commodity = 'other', or a variety
  unit        text not null check (char_length(unit) between 1 and 40),       -- as the agent wrote it: "50 kg bag", "mudu"
  per         numeric check (per is null or (per > 0 and per <= 1000)),       -- base units (kg, litre, crate, tuber) in one unit
  price       numeric not null check (price > 0 and price < 100000000),       -- naira per unit
  price_base  numeric generated always as (case when per > 0 then round(price / per, 2) end) stored,
  state       text,
  observed_on date,
  status      text not null default 'live' check (status in ('live','held','removed')),
  flag        text,                                                           -- why a price was held
  created_at  timestamptz not null default now()
);
create index if not exists ma_prices_post_idx on public.ma_prices (post_id);
create index if not exists ma_prices_check_idx on public.ma_prices (commodity, status, observed_on desc);

-- reasonable range per base unit for each atlas commodity (from the atlas price feed, Oct 2026: half the
-- 5th percentile to twice the 95th). Prices outside are held for a check; the editor can change these rows.
create table if not exists public.ma_ranges (
  commodity text primary key,
  min_base  numeric not null,
  max_base  numeric not null
);
insert into public.ma_ranges (commodity, min_base, max_base) values
  ('beansb',448,3030),('beansw',424,2476),('cashew',950,3800),('cocoa',1750,12800),('eggs',2625,12250),
  ('egusi',154,3333),('garriw',192,1240),('garriy',192,1399),('gingerdry',4000,16000),('groundnut',444,4152),
  ('hibiscus',900,5200),('maize',130,1686),('millet',136,1154),('oloyin',550,3409),('onion',100,3000),
  ('paddy',200,1200),('palmoil',1060,5000),('pepper',300,9700),('ricei',530,5339),('ricel',480,2608),
  ('sesame',525,2800),('shea',325,1300),('sorghum',140,938),('soy',282,1580),('tomato',100,5350),
  ('wheat',320,1360),('yam',410,6400)
on conflict (commodity) do nothing;

-- ---------------------------------------------------------------- helpers
-- true for the atlas editor (LARA admin account) and for the database owner working in the SQL editor
create or replace function public.ma_is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated')
      or coalesce(public.is_admin(auth.uid()), false);
$$;

-- ---------------------------------------------------------------- triggers
create or replace function public.ma_agents_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.ma_is_editor() then
    if tg_op = 'INSERT' then
      new.trusted := false; new.suspended := false;
    else
      new.trusted := old.trusted; new.suspended := old.suspended; new.id := old.id;
    end if;
  end if;
  new.handle := lower(new.handle);
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ma_agents_guard on public.ma_agents;
create trigger ma_agents_guard before insert or update on public.ma_agents
  for each row execute function public.ma_agents_guard();

create or replace function public.ma_posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if tg_op = 'INSERT' then
    if new.observed_on > current_date + 1 or new.observed_on < current_date - 30 then
      raise exception 'Prices must be from the last 30 days' using errcode = '22023';
    end if;
    select count(*) into n from public.ma_posts where agent_id = new.agent_id and created_at > now() - interval '1 day';
    if n >= 10 and not public.ma_is_editor() then
      raise exception 'Daily limit reached: you can post 10 times a day' using errcode = '54000';
    end if;
    new.status := 'live';
  elsif not public.ma_is_editor() then
    -- the agent can edit the note or take the post down; everything else stays as posted
    new.agent_id := old.agent_id; new.market_id := old.market_id; new.market_name := old.market_name;
    new.state := old.state; new.lga := old.lga; new.observed_on := old.observed_on; new.created_at := old.created_at;
    if new.status <> old.status and new.status <> 'removed' then new.status := old.status; end if;
  end if;
  return new;
end $$;
drop trigger if exists ma_posts_guard on public.ma_posts;
create trigger ma_posts_guard before insert or update on public.ma_posts
  for each row execute function public.ma_posts_guard();

create or replace function public.ma_prices_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; r record; med numeric; n int; cnt int;
begin
  if tg_op = 'INSERT' then
    select * into p from public.ma_posts where id = new.post_id;
    if p is null or p.agent_id <> new.agent_id then
      raise exception 'Not your post' using errcode = '42501';
    end if;
    select count(*) into cnt from public.ma_prices where post_id = new.post_id;
    if cnt >= 30 then raise exception 'A post can hold up to 30 prices' using errcode = '54000'; end if;
    new.state := p.state; new.observed_on := p.observed_on; new.status := 'live'; new.flag := null;
    -- 1. outside the usual range for this commodity
    if new.per > 0 and new.commodity <> 'other' then
      select * into r from public.ma_ranges where commodity = new.commodity;
      if r is not null and (new.price / new.per < r.min_base or new.price / new.per > r.max_base) then
        new.status := 'held'; new.flag := 'outside the usual range for this item';
      end if;
      -- 2. far from what other agents reported in the last 60 days
      if new.status = 'live' then
        select percentile_cont(0.5) within group (order by price_base), count(*) into med, n
          from public.ma_prices
         where commodity = new.commodity and status = 'live' and price_base is not null
           and agent_id <> new.agent_id and observed_on > current_date - 60;
        if n >= 3 and med > 0 and (new.price / new.per < med * 0.4 or new.price / new.per > med * 2.5) then
          new.status := 'held'; new.flag := 'far from other agents'' recent prices';
        end if;
      end if;
    end if;
  elsif not public.ma_is_editor() then
    -- the agent can only take a price down
    new.post_id := old.post_id; new.agent_id := old.agent_id; new.commodity := old.commodity; new.item := old.item;
    new.unit := old.unit; new.per := old.per; new.price := old.price; new.state := old.state;
    new.observed_on := old.observed_on; new.flag := old.flag; new.created_at := old.created_at;
    if new.status <> 'removed' then new.status := old.status; end if;
  end if;
  return new;
end $$;
drop trigger if exists ma_prices_guard on public.ma_prices;
create trigger ma_prices_guard before insert or update on public.ma_prices
  for each row execute function public.ma_prices_guard();

-- ---------------------------------------------------------------- row-level security
alter table public.ma_agents enable row level security;
alter table public.ma_posts  enable row level security;
alter table public.ma_prices enable row level security;
alter table public.ma_ranges enable row level security;

drop policy if exists ma_agents_read on public.ma_agents;
create policy ma_agents_read on public.ma_agents for select
  using (not suspended or id = auth.uid() or public.ma_is_editor());
drop policy if exists ma_agents_insert on public.ma_agents;
create policy ma_agents_insert on public.ma_agents for insert to authenticated
  with check (id = auth.uid());
drop policy if exists ma_agents_update on public.ma_agents;
create policy ma_agents_update on public.ma_agents for update to authenticated
  using (id = auth.uid() or public.ma_is_editor()) with check (id = auth.uid() or public.ma_is_editor());

drop policy if exists ma_posts_read on public.ma_posts;
create policy ma_posts_read on public.ma_posts for select
  using ((status = 'live' and exists (select 1 from public.ma_agents a where a.id = agent_id and not a.suspended))
         or agent_id = auth.uid() or public.ma_is_editor());
drop policy if exists ma_posts_insert on public.ma_posts;
create policy ma_posts_insert on public.ma_posts for insert to authenticated
  with check (agent_id = auth.uid() and exists (select 1 from public.ma_agents a where a.id = auth.uid() and not a.suspended));
drop policy if exists ma_posts_update on public.ma_posts;
create policy ma_posts_update on public.ma_posts for update to authenticated
  using (agent_id = auth.uid() or public.ma_is_editor()) with check (agent_id = auth.uid() or public.ma_is_editor());

drop policy if exists ma_prices_read on public.ma_prices;
create policy ma_prices_read on public.ma_prices for select
  using ((status = 'live' and exists (select 1 from public.ma_posts p join public.ma_agents a on a.id = p.agent_id
                                      where p.id = post_id and p.status = 'live' and not a.suspended))
         or agent_id = auth.uid() or public.ma_is_editor());
drop policy if exists ma_prices_insert on public.ma_prices;
create policy ma_prices_insert on public.ma_prices for insert to authenticated
  with check (agent_id = auth.uid());
drop policy if exists ma_prices_update on public.ma_prices;
create policy ma_prices_update on public.ma_prices for update to authenticated
  using (agent_id = auth.uid() or public.ma_is_editor()) with check (agent_id = auth.uid() or public.ma_is_editor());

drop policy if exists ma_ranges_read on public.ma_ranges;
create policy ma_ranges_read on public.ma_ranges for select using (true);
drop policy if exists ma_ranges_edit on public.ma_ranges;
create policy ma_ranges_edit on public.ma_ranges for all to authenticated
  using (public.ma_is_editor()) with check (public.ma_is_editor());

-- ---------------------------------------------------------------- access for the website (publishable key)
grant select on public.ma_agents, public.ma_posts, public.ma_prices, public.ma_ranges to anon, authenticated;
grant insert, update on public.ma_agents, public.ma_posts, public.ma_prices to authenticated;
grant insert, update, delete on public.ma_ranges to authenticated;
grant execute on function public.ma_is_editor() to anon, authenticated;
