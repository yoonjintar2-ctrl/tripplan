alter table public.mt_itinerary_items drop constraint if exists mt_itinerary_transport_mode_check;
alter table public.mt_itinerary_items add constraint mt_itinerary_transport_mode_check check (transport_mode is null or transport_mode in ('WALKING','DRIVING','OTHER'));
notify pgrst, 'reload schema';
