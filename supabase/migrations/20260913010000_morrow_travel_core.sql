create schema if not exists private;

create table if not exists public.mt_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '여행자',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mt_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  destination text not null default '',
  start_date date not null,
  end_date date not null,
  categories text[] not null default array['음식','관광','이동','쇼핑'],
  share_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.mt_trip_members (
  trip_id uuid not null references public.mt_trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','editor','viewer')),
  invite_code_used text,
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists public.mt_itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.mt_trips(id) on delete cascade,
  item_date date not null,
  start_time time,
  end_time time,
  icon text not null default '',
  name text not null check (char_length(name) between 1 and 100),
  maps_url text not null check (maps_url ~* '^https://([^/]*\\.)?(google\\.[^/]+|maps\\.app\\.goo\\.gl|goo\\.gl)/'),
  place_id text,
  latitude double precision,
  longitude double precision,
  category text,
  memo text,
  cost_won bigint not null default 0 check (cost_won between 0 and 100000000000),
  split_ratios jsonb not null default '{}'::jsonb check (jsonb_typeof(split_ratios) = 'object'),
  sort_order bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or start_time is null or end_time > start_time),
  check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180))
);

create index if not exists mt_trip_members_user_idx on public.mt_trip_members(user_id);
create index if not exists mt_itinerary_trip_date_idx on public.mt_itinerary_items(trip_id, item_date, start_time, sort_order);

create or replace function private.mt_touch_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mt_profiles_touch on public.mt_profiles;
create trigger mt_profiles_touch before update on public.mt_profiles for each row execute function private.mt_touch_updated_at();
drop trigger if exists mt_trips_touch on public.mt_trips;
create trigger mt_trips_touch before update on public.mt_trips for each row execute function private.mt_touch_updated_at();
drop trigger if exists mt_items_touch on public.mt_itinerary_items;
create trigger mt_items_touch before update on public.mt_itinerary_items for each row execute function private.mt_touch_updated_at();

create or replace function private.mt_handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.mt_profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, '여행자'), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists mt_on_auth_user_created on auth.users;
create trigger mt_on_auth_user_created after insert or update of raw_user_meta_data on auth.users
for each row execute function private.mt_handle_new_user();

create or replace function private.mt_has_trip_access(target_trip uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    exists (select 1 from public.mt_trips t where t.id = target_trip and t.owner_id = auth.uid())
    or exists (select 1 from public.mt_trip_members m where m.trip_id = target_trip and m.user_id = auth.uid())
  );
$$;

create or replace function private.mt_can_edit_trip(target_trip uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    exists (select 1 from public.mt_trips t where t.id = target_trip and t.owner_id = auth.uid())
    or exists (select 1 from public.mt_trip_members m where m.trip_id = target_trip and m.user_id = auth.uid() and m.role in ('owner','editor'))
  );
$$;

alter table public.mt_profiles enable row level security;
alter table public.mt_trips enable row level security;
alter table public.mt_trip_members enable row level security;
alter table public.mt_itinerary_items enable row level security;

drop policy if exists mt_profiles_read_for_authenticated on public.mt_profiles;
create policy mt_profiles_read_for_authenticated on public.mt_profiles for select to authenticated using (true);
drop policy if exists mt_profiles_update_self on public.mt_profiles;
create policy mt_profiles_update_self on public.mt_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists mt_trips_select_members on public.mt_trips;
create policy mt_trips_select_members on public.mt_trips for select to authenticated using (private.mt_has_trip_access(id));
drop policy if exists mt_trips_insert_owner on public.mt_trips;
create policy mt_trips_insert_owner on public.mt_trips for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists mt_trips_update_owner on public.mt_trips;
create policy mt_trips_update_owner on public.mt_trips for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists mt_trips_delete_owner on public.mt_trips;
create policy mt_trips_delete_owner on public.mt_trips for delete to authenticated using (owner_id = auth.uid());

drop policy if exists mt_members_select_trip on public.mt_trip_members;
create policy mt_members_select_trip on public.mt_trip_members for select to authenticated using (private.mt_has_trip_access(trip_id));
drop policy if exists mt_members_insert_owner_or_invited_self on public.mt_trip_members;
create policy mt_members_insert_owner_or_invited_self on public.mt_trip_members for insert to authenticated with check (
  (user_id = auth.uid() and role = 'editor' and exists (
    select 1 from public.mt_trips t where t.id = trip_id and t.share_code = invite_code_used
  ))
  or exists (select 1 from public.mt_trips t where t.id = trip_id and t.owner_id = auth.uid())
);
drop policy if exists mt_members_update_owner on public.mt_trip_members;
create policy mt_members_update_owner on public.mt_trip_members for update to authenticated
using (exists (select 1 from public.mt_trips t where t.id = trip_id and t.owner_id = auth.uid()))
with check (exists (select 1 from public.mt_trips t where t.id = trip_id and t.owner_id = auth.uid()));
drop policy if exists mt_members_delete_owner_or_self on public.mt_trip_members;
create policy mt_members_delete_owner_or_self on public.mt_trip_members for delete to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.mt_trips t where t.id = trip_id and t.owner_id = auth.uid())
);

drop policy if exists mt_items_select_members on public.mt_itinerary_items;
create policy mt_items_select_members on public.mt_itinerary_items for select to authenticated using (private.mt_has_trip_access(trip_id));
drop policy if exists mt_items_insert_editors on public.mt_itinerary_items;
create policy mt_items_insert_editors on public.mt_itinerary_items for insert to authenticated with check (created_by = auth.uid() and private.mt_can_edit_trip(trip_id));
drop policy if exists mt_items_update_editors on public.mt_itinerary_items;
create policy mt_items_update_editors on public.mt_itinerary_items for update to authenticated using (private.mt_can_edit_trip(trip_id)) with check (private.mt_can_edit_trip(trip_id));
drop policy if exists mt_items_delete_editors on public.mt_itinerary_items;
create policy mt_items_delete_editors on public.mt_itinerary_items for delete to authenticated using (private.mt_can_edit_trip(trip_id));

revoke all on public.mt_profiles, public.mt_trips, public.mt_trip_members, public.mt_itinerary_items from anon, public;
grant select, insert, update, delete on public.mt_profiles, public.mt_trips, public.mt_trip_members, public.mt_itinerary_items to authenticated;
grant usage on schema private to authenticated;
revoke all on function private.mt_has_trip_access(uuid), private.mt_can_edit_trip(uuid) from public;
grant execute on function private.mt_has_trip_access(uuid), private.mt_can_edit_trip(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.mt_trips;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.mt_trip_members;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.mt_itinerary_items;
exception when duplicate_object then null;
end $$;
