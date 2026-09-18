create or replace function public.mt_get_shared_trip(p_trip_id uuid, p_share_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'trip', jsonb_build_object(
      'id', t.id,
      'owner_id', t.owner_id,
      'title', t.title,
      'destination', t.destination,
      'start_date', t.start_date,
      'end_date', t.end_date,
      'categories', t.categories,
      'share_code', null,
      'updated_at', t.updated_at
    ),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) - 'created_by' order by i.item_date, i.start_time, i.sort_order)
      from public.mt_itinerary_items i
      where i.trip_id = t.id
    ), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'role', m.role,
        'joined_at', m.joined_at,
        'display_name', coalesce(p.display_name, '여행자'),
        'avatar_url', ''
      ) order by m.joined_at)
      from public.mt_trip_members m
      left join public.mt_profiles p on p.id = m.user_id
      where m.trip_id = t.id
    ), '[]'::jsonb)
  )
  from public.mt_trips t
  where t.id = p_trip_id
    and t.share_code = p_share_code
  limit 1;
$$;

revoke all on function public.mt_get_shared_trip(uuid, text) from public;
grant execute on function public.mt_get_shared_trip(uuid, text) to anon, authenticated;
