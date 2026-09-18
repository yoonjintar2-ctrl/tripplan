create index if not exists mt_trips_owner_idx on public.mt_trips(owner_id);
create index if not exists mt_itinerary_created_by_idx on public.mt_itinerary_items(created_by);

create or replace function private.mt_is_registered_user()
returns boolean language sql stable set search_path = pg_catalog as $$
  select auth.uid() is not null and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

create or replace function private.mt_has_trip_access(target_trip uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.mt_is_registered_user() and (
    exists (select 1 from public.mt_trips t where t.id = target_trip and t.owner_id = (select auth.uid()))
    or exists (select 1 from public.mt_trip_members m where m.trip_id = target_trip and m.user_id = (select auth.uid()))
  );
$$;

create or replace function private.mt_can_edit_trip(target_trip uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.mt_is_registered_user() and (
    exists (select 1 from public.mt_trips t where t.id = target_trip and t.owner_id = (select auth.uid()))
    or exists (select 1 from public.mt_trip_members m where m.trip_id = target_trip and m.user_id = (select auth.uid()) and m.role in ('owner','editor'))
  );
$$;

create or replace function private.mt_shares_trip(target_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.mt_is_registered_user() and (
    target_user = (select auth.uid())
    or exists (
      select 1 from public.mt_trip_members mine
      join public.mt_trip_members theirs on theirs.trip_id = mine.trip_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = target_user
    )
    or exists (
      select 1 from public.mt_trips t
      join public.mt_trip_members m on m.trip_id = t.id
      where t.owner_id = (select auth.uid()) and m.user_id = target_user
    )
  );
$$;

drop policy if exists mt_profiles_read_trip_members on public.mt_profiles;
create policy mt_profiles_read_trip_members on public.mt_profiles for select to authenticated
using (private.mt_is_registered_user() and private.mt_shares_trip(id));
drop policy if exists mt_profiles_update_self on public.mt_profiles;
create policy mt_profiles_update_self on public.mt_profiles for update to authenticated
using (private.mt_is_registered_user() and id = (select auth.uid()))
with check (private.mt_is_registered_user() and id = (select auth.uid()));

drop policy if exists mt_trips_select_members on public.mt_trips;
create policy mt_trips_select_members on public.mt_trips for select to authenticated
using (private.mt_is_registered_user() and private.mt_has_trip_access(id));
drop policy if exists mt_trips_insert_owner on public.mt_trips;
create policy mt_trips_insert_owner on public.mt_trips for insert to authenticated
with check (private.mt_is_registered_user() and owner_id = (select auth.uid()));
drop policy if exists mt_trips_update_owner on public.mt_trips;
create policy mt_trips_update_owner on public.mt_trips for update to authenticated
using (private.mt_is_registered_user() and owner_id = (select auth.uid()))
with check (private.mt_is_registered_user() and owner_id = (select auth.uid()));
drop policy if exists mt_trips_delete_owner on public.mt_trips;
create policy mt_trips_delete_owner on public.mt_trips for delete to authenticated
using (private.mt_is_registered_user() and owner_id = (select auth.uid()));

drop policy if exists mt_members_select_trip on public.mt_trip_members;
create policy mt_members_select_trip on public.mt_trip_members for select to authenticated
using (private.mt_is_registered_user() and private.mt_has_trip_access(trip_id));
drop policy if exists mt_members_insert_owner_or_invited_self on public.mt_trip_members;
create policy mt_members_insert_owner_or_invited_self on public.mt_trip_members for insert to authenticated with check (
  private.mt_is_registered_user() and (
    (user_id = (select auth.uid()) and role = 'editor' and exists (
      select 1 from public.mt_trips t where t.id = trip_id and t.share_code = invite_code_used
    ))
    or exists (select 1 from public.mt_trips t where t.id = trip_id and t.owner_id = (select auth.uid()))
  )
);
drop policy if exists mt_members_update_owner on public.mt_trip_members;
create policy mt_members_update_owner on public.mt_trip_members for update to authenticated
using (private.mt_is_registered_user() and exists (select 1 from public.mt_trips t where t.id = trip_id and t.owner_id = (select auth.uid())))
with check (private.mt_is_registered_user() and exists (select 1 from public.mt_trips t where t.id = trip_id and t.owner_id = (select auth.uid())));
drop policy if exists mt_members_delete_owner_or_self on public.mt_trip_members;
create policy mt_members_delete_owner_or_self on public.mt_trip_members for delete to authenticated using (
  private.mt_is_registered_user() and (
    user_id = (select auth.uid()) or exists (select 1 from public.mt_trips t where t.id = trip_id and t.owner_id = (select auth.uid()))
  )
);

drop policy if exists mt_items_select_members on public.mt_itinerary_items;
create policy mt_items_select_members on public.mt_itinerary_items for select to authenticated
using (private.mt_is_registered_user() and private.mt_has_trip_access(trip_id));
drop policy if exists mt_items_insert_editors on public.mt_itinerary_items;
create policy mt_items_insert_editors on public.mt_itinerary_items for insert to authenticated
with check (private.mt_is_registered_user() and created_by = (select auth.uid()) and private.mt_can_edit_trip(trip_id));
drop policy if exists mt_items_update_editors on public.mt_itinerary_items;
create policy mt_items_update_editors on public.mt_itinerary_items for update to authenticated
using (private.mt_is_registered_user() and private.mt_can_edit_trip(trip_id))
with check (private.mt_is_registered_user() and private.mt_can_edit_trip(trip_id));
drop policy if exists mt_items_delete_editors on public.mt_itinerary_items;
create policy mt_items_delete_editors on public.mt_itinerary_items for delete to authenticated
using (private.mt_is_registered_user() and private.mt_can_edit_trip(trip_id));

revoke all on function private.mt_is_registered_user() from public;
grant execute on function private.mt_is_registered_user() to authenticated;
