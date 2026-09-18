create or replace function private.mt_shares_trip(target_user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and (
    target_user = auth.uid()
    or exists (
      select 1
      from public.mt_trip_members mine
      join public.mt_trip_members theirs on theirs.trip_id = mine.trip_id
      where mine.user_id = auth.uid() and theirs.user_id = target_user
    )
    or exists (
      select 1
      from public.mt_trips t
      join public.mt_trip_members m on m.trip_id = t.id
      where t.owner_id = auth.uid() and m.user_id = target_user
    )
  );
$$;

drop policy if exists mt_profiles_read_for_authenticated on public.mt_profiles;
create policy mt_profiles_read_trip_members on public.mt_profiles
for select to authenticated using (private.mt_shares_trip(id));

revoke all on function private.mt_shares_trip(uuid) from public;
grant execute on function private.mt_shares_trip(uuid) to authenticated;
