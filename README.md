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

Run `npm ci && npm test` for the utility and DOM interaction suites. The interaction suite mocks Google Maps and Supabase and does not write user data. GitHub Pages runs both suites before deployment.

`examples/uk-parents-5days.json` contains a 25-item, London-based 4-night/5-day sample with breaks and 3 travelers. Dates are illustrative (2026-10-12–16), times are local to London, and no bookings or payments are implied. The requested account received this example separately; the JSON contains no account credentials or private account IDs.
