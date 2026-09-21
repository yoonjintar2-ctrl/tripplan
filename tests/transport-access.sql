-- Administrator-only regression: all synthetic fixtures are rolled back. Needs two existing registered accounts.
begin;
do $$
declare
 owner_uid uuid; guest_uid uuid; tid uuid:=gen_random_uuid(); iid uuid:=gen_random_uuid();
 secret text:=replace(gen_random_uuid()::text,'-',''); n integer;
begin
 select id into owner_uid from auth.users where not coalesce(is_anonymous,false) order by created_at limit 1;
 select id into guest_uid from auth.users where not coalesce(is_anonymous,false) and id<>owner_uid order by created_at limit 1;
 if guest_uid is null then raise exception 'Two existing accounts are needed for the rollback test';end if;
 insert into public.mt_trips(id,owner_id,title,start_date,end_date,share_code,travelers)
 values(tid,owner_uid,'v17 rollback test','2026-10-01','2026-10-03',secret,
 jsonb_build_array(jsonb_build_object('id',owner_uid,'nickname','test','avatar','male-001')));
 insert into public.mt_trip_members(trip_id,user_id,role)values(tid,owner_uid,'owner');
 insert into public.mt_itinerary_items(id,trip_id,item_date,name,memo,cost_won,created_by)
 values(iid,tid,'2026-10-03','keep me','keep memo',12000,owner_uid);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',guest_uid,'role','authenticated','is_anonymous',false)::text,true);
 execute 'set local role authenticated';
 select count(*) into n from public.mt_trips where id=tid;
 if n<>0 then raise exception 'Uninvited trip was visible';end if;
 begin
  perform * from public.mt_trip_accounts(tid);
  raise exception 'Uninvited account roster was visible';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.mt_trip_members(trip_id,user_id,role,invite_code_used)values(tid,guest_uid,'editor','invalid-code-123456789');
  raise exception 'Invalid invite accepted';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.mt_trip_members(trip_id,user_id,role,invite_code_used)values(tid,guest_uid,'owner',secret);
  raise exception 'Invite allowed owner escalation';
 exception when insufficient_privilege then null;end;
 insert into public.mt_trip_members(trip_id,user_id,role,invite_code_used)values(tid,guest_uid,'editor',secret);
 select count(*) into n from public.mt_trips where id=tid;
 if n<>1 then raise exception 'Invited trip not visible';end if;
 update public.mt_itinerary_items set name='editor success',transport_mode='DRIVING' where id=iid;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Invited editor cannot edit';end if;
 if (select transport_mode from public.mt_itinerary_items where id=iid)<>'DRIVING' then raise exception 'Mode did not persist';end if;
 begin
 update public.mt_itinerary_items set transport_mode='INVALID' where id=iid;
 raise exception 'Invalid mode accepted';
 exception when check_violation then null;end; 
 select count(*) into n from public.mt_trip_accounts(tid) where email is not null;
 if n<>2 then raise exception 'Account roster missing';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated','is_anonymous',false)::text,true);
 perform public.mt_update_trip_settings(tid,'v17 rollback test','','2026-11-01','2026-11-02',true);
 select count(*) into n from public.mt_itinerary_items where id=iid and item_date='2026-11-02' and memo='keep memo' and cost_won=12000 and name='editor success' and transport_mode='DRIVING';
 if n<>1 then raise exception 'Shortening deleted or changed item content';end if;
 perform public.mt_update_trip_settings(tid,'v17 rollback test','','2026-12-01','2026-12-05',false);
 select count(*) into n from public.mt_itinerary_items where id=iid and item_date='2026-12-02';
 if n<>1 then raise exception 'Extending did not preserve relative date';end if;
 update public.mt_trip_members set role='viewer' where trip_id=tid and user_id=guest_uid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',guest_uid,'role','authenticated','is_anonymous',false)::text,true);
 update public.mt_itinerary_items set name='should not edit',transport_mode='WALKING' where id=iid;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Viewer can edit';end if;
 execute 'reset role';
end $$;
rollback;
select 'PASS: invite, invalid token, owner escalation, member emails, editor/viewer rights, date shrink/extend preserve items; fixtures rolled back' as result;
