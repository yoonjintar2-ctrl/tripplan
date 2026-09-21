-- The invitation secret is an internal lookup: non-members cannot SELECT the trip.
-- Return only a boolean, require a registered account, and never expose trip rows.
create or replace function private.mt_invite_matches(target_trip uuid, supplied_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.mt_is_registered_user()
    and length(coalesce(supplied_code,'')) >= 16
    and exists(select 1 from public.mt_trips t where t.id=target_trip and t.share_code=supplied_code);
$$;
revoke all on function private.mt_invite_matches(uuid,text) from public,anon;
grant execute on function private.mt_invite_matches(uuid,text) to authenticated;

drop policy if exists mt_members_insert_owner_or_invited_self on public.mt_trip_members;
create policy mt_members_insert_owner_or_invited_self on public.mt_trip_members for insert to authenticated
with check (private.mt_is_registered_user() and (
  (user_id=(select auth.uid()) and role='editor' and private.mt_invite_matches(trip_id,invite_code_used))
  or exists(select 1 from public.mt_trips t where t.id=trip_id and t.owner_id=(select auth.uid()))
));

-- Account identity comes from Auth, not user-editable profile metadata.
-- Only members/owner of this specific trip may read its account roster.
create or replace function private.mt_trip_accounts(target_trip uuid)
returns table(user_id uuid,role text,joined_at timestamptz,email text,display_name text,avatar_url text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.mt_is_registered_user() or not private.mt_has_trip_access(target_trip) then
    raise exception '이 여행의 구성원만 계정을 확인할 수 있습니다.' using errcode='42501';
  end if;
  return query
    select m.user_id, case when t.owner_id=m.user_id then 'owner' else m.role end,
      m.joined_at,u.email::text,p.display_name,p.avatar_url
    from public.mt_trip_members m join public.mt_trips t on t.id=m.trip_id
    join auth.users u on u.id=m.user_id left join public.mt_profiles p on p.id=m.user_id
    where m.trip_id=target_trip order by m.joined_at;
end;
$$;
revoke all on function private.mt_trip_accounts(uuid) from public,anon;
grant execute on function private.mt_trip_accounts(uuid) to authenticated;
create or replace function public.mt_trip_accounts(p_trip_id uuid)
returns table(user_id uuid,role text,joined_at timestamptz,email text,display_name text,avatar_url text)
language sql stable security invoker set search_path = '' as $$
  select * from private.mt_trip_accounts(p_trip_id);
$$;
revoke all on function public.mt_trip_accounts(uuid) from public,anon;
grant execute on function public.mt_trip_accounts(uuid) to authenticated;

-- Keep the legacy boolean parameter so older clients cannot accidentally delete items.
create or replace function public.mt_update_trip_settings(
  p_trip_id uuid,p_title text,p_destination text,p_start_date date,p_end_date date,p_delete_items boolean default false
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_owner_id uuid; v_old_start date; v_old_end date;
begin
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception '종료일은 시작일과 같거나 이후여야 합니다.';
  end if;
  select owner_id,start_date,end_date into v_owner_id,v_old_start,v_old_end
    from public.mt_trips where id=p_trip_id for update;
  if not found or auth.uid() is null or v_owner_id<>auth.uid() then
    raise exception '여행 소유자만 정보를 수정할 수 있습니다.';
  end if;
  if v_old_start<>p_start_date or v_old_end<>p_end_date then
    update public.mt_itinerary_items
      set item_date=least(p_end_date,greatest(p_start_date,p_start_date+(item_date-v_old_start)))
      where trip_id=p_trip_id;
  end if;
  update public.mt_trips set title=p_title,destination=coalesce(p_destination,''),
    start_date=p_start_date,end_date=p_end_date where id=p_trip_id;
end;
$$;
revoke all on function public.mt_update_trip_settings(uuid,text,text,date,date,boolean) from public,anon;
grant execute on function public.mt_update_trip_settings(uuid,text,text,date,date,boolean) to authenticated;
