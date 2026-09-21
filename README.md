# Morrow · 여행계획닷컴

Shared travel planning with a responsive Airy editor, Google place search and link recognition, optional accounting, a 400-face traveler picker, and individual routes.

Static entrypoint: `dist/index.html`. Tests: `node tests/travel-utils.test.mjs`.

The frontend uses Supabase publishable credentials and a browser Google Maps key. Authorization is enforced by Supabase RLS; secret/service-role credentials must never be added to this repository.

## GitHub Pages

Live site: https://yoonjintar2-ctrl.github.io/tripplan/

The included workflow publishes `dist/` from `main`. In Settings → Pages, select **GitHub Actions** as the source.

When moving to a new origin, add the exact published URL to Supabase Auth's redirect URL allowlist and the origin to the Google Maps browser-key referrer allowlist. Keep existing origins while old shared links are in use. The `resolve-maps-link` Edge Function allows the existing Sites origin, `https://yoonjintar0-commits.github.io`, and `https://yoonjintar2-ctrl.github.io`.

## Data and updates

- `mt_trips.travelers` stores stable traveler IDs, nicknames and local character keys independently of account editing permissions.
- A null `participant_ids` means everyone, including travelers added later. Explicit IDs apply only to those travelers.
- `settlement_enabled` defaults to false. Existing nonzero expenses were preserved during migration. Equal and custom shares apply only to attendees; rounding preserves the exact total.
- The map draws per-group straight connecting lines, with animated traveler markers. These are itinerary connections, not navigable road directions.
- Google returns a limited review selection. The UI displays up to three of those reviews in date order with author attribution, not an exhaustive latest-review feed.

Character artwork: Adventurer by Lisa Wischofsky, customized via DiceBear 9.4.3, CC BY 4.0. See `dist/assets/avatars/ATTRIBUTION.md`.

## Local handoff status (2026-09-19)

- Integrated the supplied Airy source while preserving local workspace metadata and authentication settings.
- Supabase Auth allows `https://yoonjintar2-ctrl.github.io/tripplan/**`; OAuth uses the current deployment URL and preserves invitation parameters. Existing redirect entries were retained.
- The existing Google Maps browser key allows `https://yoonjintar2-ctrl.github.io/*` while retaining its API restrictions.
- `resolve-maps-link` version 3 was deployed with JWT verification and the new GitHub origin.
- The optional-place and Airy traveler/settlement database migrations were already applied remotely and were not rerun. Match migration names and schema state before applying the bundled SQL.
- Initial authenticated workspace loading retries transient failures up to three times and coalesces simultaneous sign-in events. Loading and error messages are not reported as successful saves.
- Mobile keeps a bounded, scrollable agenda above a fixed-height map. Schedule editor content scrolls while the close control stays visible.

## Captain Beer update (2026-09-21)

The current UI uses the supplied Captain Beer logo/social card, three clay guide poses, a monochrome interface, and 400 clay traveler portraits with stable avatar IDs. Brand rules and generation prompts live in `docs/brand/`.

Time fields open an hour/minute picker. Itinerary icons and the trip destination field have been removed. Existing trip destination metadata is preserved on edits. Hovering an itinerary no longer changes the map.

The main map offers “이 장소로 일정 추가” on POI/point selection. The editor shows numbered search results on a map and accepts POI or coordinate selection. Place details can collapse/expand on PC and mobile. Map interactions use Google's supported POI click events: https://developers.google.com/maps/documentation/javascript/examples/event-poi

Run `npm ci && npm test` for the utility and DOM interaction suites. The interaction suite mocks Google Maps and Supabase and does not write user data. The current GitHub Pages workflow runs the dependency-free utility suite before deployment; run `npm test` locally for all suites.

`examples/uk-parents-5days.json` contains a 25-item, London-based 4-night/5-day sample with breaks and 3 travelers. Dates are illustrative (2026-10-12–16), times are local to London, and no bookings or payments are implied. The requested account received this example separately; the JSON contains no account credentials or private account IDs.

## Avatar studio and live trip clock (2026-09-21)

The picker now includes the original 400 white-outfit portraits plus 50 hairstyles (hime, hush, butterfly, bob, pixie, bald, buzz, crew, drop and crop). Choose a face, then combine 21 wearables across seven categories and select original/yellow/brown/white hair. Canvas composition uses face/eye/neck anchors and a hair mask; optional position/size adjustments are saved with the look. `travelers[].appearance` is stored by the existing settings RPC, with stable base avatar IDs and optional `extra-*` variant IDs. No database migration is required.

Map selection uses a small coordinate-anchored popup with edge clamping. Captain flags mark stops; the selected flag and clicked point show expanding rings. Captain walks along the displayed straight route in itinerary order and pauses to read a map or use a telescope. The small decorative map frame, route animation and rings respect reduced-motion preferences and the pause control.

Captain shows calendar-day D-minus before departure, red ON AIR throughout the trip dates, and a completed message afterward. The date and time use the viewer's device clock, matching the existing time fields. During a trip, the current date and schedule are selected automatically on load and at minute changes (checked every 15 seconds). Manual date/stop selection pauses following; “현재 일정으로” resumes. Explicit end times are respected, including gaps. Without an end time, an item lasts until the next timed item, or one hour for the final item. Untimed items are not marked current.

The timeline displays the current time, active stop and elapsed fraction. `examples/seoul-on-air.json` is the account-free copy of the six-stop example created for 2026-09-21. Its broad time windows are for previewing ON AIR; edit the dates/times to try it on another day.

Validation: `npm test` covers time boundaries, clock modes, manual-follow behavior, appearance persistence, popup positioning, asset IDs and route order, with Maps/Supabase mocks. Avatar composites were rendered with the production composer. The managed browser could not open the local preview URL, so live Google Maps rendering and deployed mobile layout still need verification after upload.
