# Captain Beer · 여행계획닷컴

This repository's current main branch is the source of truth. Apply new work to the current code, not older handoff documents.

## Character identity

Reference: user-supplied logo and character-book pages in this directory.
- Captain Beer: red cap and shorts, long black chunky hair and full beard, no eyes/nose/mouth, round belly with X navel, mitten hands, bare feet, matte 3D clay.
- Traveler avatars: the same warm light peach-ivory skin and matte sculpted clay material, with visible eyes, nose and mouth. Vary hairstyles, face shapes, eyebrows, eyes, noses, mouths and expressions. No hats, headwear, glasses, jewelry or accessories. Restrict hair to soft black and very dark brown. Use plain grey crew-neck tops with no seasonal clothing cues. Captain Beer's own red cap is unchanged.
- Keep all existing `male-001`–`male-200` and `female-001`–`female-200` IDs stable. New assets are WebP under `dist/assets/avatars-clay/`.
- UI chrome is neutral white, gray and charcoal. Red remains in Captain Beer's brand artwork. Route lines may use restrained distinct colors for legibility.
- Guide artwork is small, static and in allocated space. Never cover input controls, map attribution, or the user's current selection. Include mobile layouts and reduced-motion support.

## Assets

- `dist/assets/captain/logo.png`: supplied logo, optimized for the site.
- `dist/assets/captain/share.jpg`: supplied sharing thumbnail, used as OG image.
- `guide-flag.webp`, `guide-map.webp`, `guide-pin.webp`: generated from the supplied character reference using built-in ImageGen; mechanically cropped from the three-pose atlas and encoded for the web.
- 400 traveler faces: built-in ImageGen, 16 separate 5×5 atlases. Each atlas is sliced into 25 individual 224px WebP files. The current version 2 prompt set is in `avatar-v2-prompts.json`; `image-prompts.json` is historical version 1. Skin tone is visually consistent; rendered light and shadow are naturally not a single flat RGB value.
- Earlier DiceBear assets and attribution remain in the repository as legacy assets; the current UI loads the clay set.

## Interaction rules

- Select an itinerary by click/tap; never pan the map on hover.
- Time fields open a click/tap hour-and-minute picker. No numeric time entry is required.
- No itinerary-icon picker and no destination text input in trip management. Preserve existing destination values when saving older trips.
- Both the main map and editor map support POI selection. Plain map points can be saved as exact coordinates.
- Text search shows a matching numbered-pin map; selecting either result or pin updates the same place fields.
- Place photo/review cards can collapse and expand on desktop and mobile.
