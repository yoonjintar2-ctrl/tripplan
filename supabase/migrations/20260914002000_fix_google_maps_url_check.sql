alter table public.mt_itinerary_items
drop constraint if exists mt_itinerary_items_maps_url_check;

alter table public.mt_itinerary_items
add constraint mt_itinerary_items_maps_url_check
check (
  maps_url ~* '^https://([^/]+[.])?(google[.][^/]+|maps[.]app[.]goo[.]gl|goo[.]gl)/'
);
