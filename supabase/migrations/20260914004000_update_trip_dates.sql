create or replace function public.mt_update_trip_settings(
  p_trip_id uuid,
  p_title text,
  p_destination text,
  p_start_date date,
  p_end_date date,
  p_delete_items boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_old_start date;
  v_old_end date;
  v_has_items boolean;
begin
  if p_end_date < p_start_date then
    raise exception '종료일은 시작일과 같거나 이후여야 합니다.';
  end if;

  select owner_id, start_date, end_date
    into v_owner_id, v_old_start, v_old_end
    from public.mt_trips
    where id = p_trip_id
    for update;

  if not found or v_owner_id <> auth.uid() then
    raise exception '여행 소유자만 정보를 수정할 수 있습니다.';
  end if;

  select exists(select 1 from public.mt_itinerary_items where trip_id = p_trip_id)
    into v_has_items;

  if (v_old_start <> p_start_date or v_old_end <> p_end_date) and v_has_items then
    if (v_old_end - v_old_start) <> (p_end_date - p_start_date) then
      if not p_delete_items then
        raise exception '여행 일수가 달라 기존 일정 삭제 확인이 필요합니다.';
      end if;
      delete from public.mt_itinerary_items where trip_id = p_trip_id;
    else
      update public.mt_itinerary_items
        set item_date = p_start_date + (item_date - v_old_start)
        where trip_id = p_trip_id;
    end if;
  end if;

  update public.mt_trips
    set title = p_title,
        destination = coalesce(p_destination, ''),
        start_date = p_start_date,
        end_date = p_end_date
    where id = p_trip_id;
end;
$$;

revoke all on function public.mt_update_trip_settings(uuid, text, text, date, date, boolean) from public, anon;
grant execute on function public.mt_update_trip_settings(uuid, text, text, date, date, boolean) to authenticated;
