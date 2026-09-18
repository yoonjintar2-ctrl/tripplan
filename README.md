# Morrow · 여행계획닷컴

Shared travel planning with a responsive Airy editor, Google place search and link recognition, optional accounting, a 400-face traveler picker, and individual routes.

Static entrypoint: `dist/index.html`. Tests: `node tests/travel-utils.test.mjs`.

The frontend uses Supabase publishable credentials and a browser Google Maps key. Authorization is enforced by Supabase RLS; secret/service-role credentials must never be added to this repository.

## GitHub Pages

The included workflow publishes `dist/` from `main`. In Settings → Pages, select **GitHub Actions** as the source.

When moving to a new origin, add the exact published URL to Supabase Auth's redirect URL allowlist and the origin to the Google Maps browser-key referrer allowlist. Keep existing origins while old shared links are in use. The `resolve-maps-link` Edge Function allows the existing Sites origin and `https://yoonjintar0-commits.github.io`.

## Data and updates

- `mt_trips.travelers` stores stable traveler IDs, nicknames and local character keys independently of account editing permissions.
- A null `participant_ids` means everyone, including travelers added later. Explicit IDs apply only to those travelers.
- `settlement_enabled` defaults to false. Existing nonzero expenses were preserved during migration. Equal and custom shares apply only to attendees; rounding preserves the exact total.
- The map draws per-group straight connecting lines, with animated traveler markers. These are itinerary connections, not navigable road directions.
- Google returns a limited review selection. The UI displays up to three of those reviews in date order with author attribution, not an exhaustive latest-review feed.

Character artwork: Adventurer by Lisa Wischofsky, customized via DiceBear 9.4.3, CC BY 4.0. See `dist/assets/avatars/ATTRIBUTION.md`.
