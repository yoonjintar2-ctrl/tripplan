drop policy if exists mt_trips_select_members on public.mt_trips;

create policy mt_trips_select_members
on public.mt_trips
for select
to authenticated
using (
  private.mt_is_registered_user()
  and (
    owner_id = (select auth.uid())
    or private.mt_has_trip_access(id)
  )
);
