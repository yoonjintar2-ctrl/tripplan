-- Incoming travel preference. NULL retains automatic recommendations.
alter table public.mt_itinerary_items add column if not exists transport_mode text;
alter table public.mt_itinerary_items drop constraint if exists mt_itinerary_transport_mode_check;
alter table public.mt_itinerary_items add constraint mt_itinerary_transport_mode_check check (transport_mode is null or transport_mode in ('WALKING','DRIVING'));
comment on column public.mt_itinerary_items.transport_mode is 'Preferred transport from the previous mapped itinerary item; NULL selects automatically.';
notify pgrst, 'reload schema';
