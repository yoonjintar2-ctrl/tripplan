alter table public.mt_trips add column travelers jsonb not null default '[]'::jsonb;
alter table public.mt_itinerary_items add column participant_ids uuid[];
alter table public.mt_itinerary_items add column settlement_enabled boolean not null default false;

-- Preserve existing accounting, member IDs and shared links.
update public.mt_itinerary_items set settlement_enabled = true where cost_won > 0;
update public.mt_trips t set travelers = coalesce((
  select jsonb_agg(jsonb_build_object('id', m.user_id, 'nickname', coalesce(p.display_name, '여행자'), 'avatar', 'male-001') order by m.joined_at)
  from public.mt_trip_members m left join public.mt_profiles p on p.id=m.user_id where m.trip_id=t.id
), jsonb_build_array(jsonb_build_object('id',t.owner_id,'nickname','여행자','avatar','male-001')));

create or replace function private.mt_validate_travelers()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare person jsonb; ids uuid[] := '{}'; person_id uuid;
begin
  if tg_op='INSERT' and new.travelers='[]'::jsonb then
    new.travelers := jsonb_build_array(jsonb_build_object('id',new.owner_id,'nickname','여행자','avatar','male-001'));
  end if;
  if jsonb_typeof(new.travelers) <> 'array' or jsonb_array_length(new.travelers) not between 1 and 100 then
    raise exception '여행 인원은 1명부터 100명까지 설정할 수 있습니다.';
  end if;
  for person in select value from jsonb_array_elements(new.travelers) loop
    if jsonb_typeof(person) <> 'object' or not (person ?& array['id','nickname','avatar'])
      or jsonb_typeof(person->'nickname') <> 'string' or jsonb_typeof(person->'id') <> 'string' or jsonb_typeof(person->'avatar') <> 'string'
      or char_length(btrim(person->>'nickname')) not between 1 and 40
      or (person->>'avatar') !~ '^(male|female)-(00[1-9]|0[1-9][0-9]|1[0-9][0-9]|200)$' then
      raise exception '닉네임과 캐릭터를 확인해 주세요.';
    end if;
    person_id := (person->>'id')::uuid;
    if person_id is null or person_id=any(ids) then raise exception '여행 인원이 중복되었습니다.'; end if;
    ids := array_append(ids,person_id);
  end loop;
  if tg_op='UPDATE' and new.travelers is distinct from old.travelers and exists (
    select 1 from public.mt_itinerary_items i where i.trip_id=new.id and (
      (i.participant_ids is not null and not i.participant_ids <@ ids)
      or exists(select 1 from jsonb_object_keys(i.split_ratios) k where not k::uuid=any(ids))
    )
  ) then raise exception '삭제할 인원이 지정된 일정의 참석·정산 설정을 먼저 변경해 주세요.'; end if;
  return new;
end; $$;
create trigger mt_validate_travelers before insert or update of travelers on public.mt_trips for each row execute function private.mt_validate_travelers();

create or replace function private.mt_validate_item_travelers()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare roster jsonb; ids uuid[]; ratio_sum numeric;
begin
  select travelers into roster from public.mt_trips where id=new.trip_id;
  if not found then raise exception '여행을 확인할 수 없습니다.'; end if;
  select array_agg((value->>'id')::uuid) into ids from jsonb_array_elements(roster);
  if new.participant_ids is not null and (cardinality(new.participant_ids)=0
    or array_position(new.participant_ids,null) is not null or not new.participant_ids <@ ids
    or cardinality(new.participant_ids) <> (select count(distinct id) from unnest(new.participant_ids) id)) then
    raise exception '이 여행에 등록된 참석 인원을 선택해 주세요.';
  end if;
  if new.settlement_enabled and new.split_ratios <> '{}'::jsonb then
    ids := coalesce(new.participant_ids,ids);
    if exists(select 1 from jsonb_each(new.split_ratios) r where jsonb_typeof(r.value)<>'number'
      or not r.key::uuid=any(ids) or (r.value::text)::numeric not between 0 and 100) then
      raise exception '참석 인원의 정산 비율을 확인해 주세요.';
    end if;
    select sum((value::text)::numeric) into ratio_sum from jsonb_each(new.split_ratios);
    if abs(coalesce(ratio_sum,0)-100) > 0.05 then raise exception '배분율 합계를 100%%로 맞춰 주세요.'; end if;
  end if;
  return new;
end; $$;
create trigger mt_validate_item_travelers before insert or update of participant_ids, split_ratios, settlement_enabled, trip_id on public.mt_itinerary_items for each row execute function private.mt_validate_item_travelers();
revoke all on function private.mt_validate_travelers(), private.mt_validate_item_travelers() from public, anon;

create or replace function public.mt_save_trip_settings(p_trip_id uuid, p_title text, p_destination text, p_start_date date, p_end_date date, p_travelers jsonb, p_delete_items boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  perform public.mt_update_trip_settings(p_trip_id,p_title,p_destination,p_start_date,p_end_date,p_delete_items);
  update public.mt_trips set travelers=p_travelers where id=p_trip_id and owner_id=auth.uid();
end; $$;
revoke all on function public.mt_save_trip_settings(uuid,text,text,date,date,jsonb,boolean) from public,anon;
grant execute on function public.mt_save_trip_settings(uuid,text,text,date,date,jsonb,boolean) to authenticated;

-- Extend the existing capability-link reader, preserving its secret-token gate.
create or replace function public.mt_get_shared_trip(p_trip_id uuid,p_share_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trip',jsonb_build_object('id',t.id,'owner_id',t.owner_id,'title',t.title,'destination',t.destination,'start_date',t.start_date,'end_date',t.end_date,'categories',t.categories,'travelers',t.travelers,'share_code',null,'updated_at',t.updated_at),
    'items',coalesce((select jsonb_agg(to_jsonb(i)-'created_by' order by i.item_date,i.start_time,i.sort_order) from public.mt_itinerary_items i where i.trip_id=t.id),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'joined_at',m.joined_at,'display_name',coalesce(p.display_name,'여행자'),'avatar_url','') order by m.joined_at) from public.mt_trip_members m left join public.mt_profiles p on p.id=m.user_id where m.trip_id=t.id),'[]'::jsonb)
  ) from public.mt_trips t where t.id=p_trip_id and t.share_code=p_share_code limit 1;
$$;
revoke all on function public.mt_get_shared_trip(uuid,text) from public;
grant execute on function public.mt_get_shared_trip(uuid,text) to anon,authenticated;
