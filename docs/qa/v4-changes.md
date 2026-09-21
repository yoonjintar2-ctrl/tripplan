# Captain UI and avatar fitting — v4

Apply this update over v3 (4654687). The enlarged Captain frame is a design concept only and is intentionally awaiting the user's choice.

Changes:
- All 400 base portraits and 50 hairstyle variants have stored eye/neck/head measurements. Twenty-nine eye detections were corrected after visual review.
- Eyeglasses use front-only assets; no temple bars are drawn over the face. Forehead hair colour has a soft root transition. Clothes render behind skin and hair, with rear collar occlusion.
- Accessories share the same normalized portrait coordinates; existing saved appearances and manual adjustments remain supported.
- Selecting a mapped stop hides and pauses the route walker. Clearing selection resumes the existing walker. Motion uses one predecoded 12-frame atlas, avoiding per-frame image downloads and replacements.
- Trip list rows offer Load, Link and Delete together; deletion remains limited to the owner and uses the existing confirmation.
- Schedule label reads “일정 이름”. ON AIR keeps the original charcoal top navigation.

Validation:
- `npm test`: calendar/current-time boundaries, existing planner interactions, new trip list controls, permission guard, decoded atlas and selected/walking exclusivity.
- `tools/inspect-avatar-fits.cjs`: source-eye/neck contact sheets.
- `tools/finalize-avatar-fits.cjs`: saved measurements and reviewed exceptions.
- `tools/render-avatar-audit.cjs`: native Canvas executes the compositor; 3,150 combinations cover all 450 portraits and all 21 wardrobe options. After the final skin-shadow and bald-hair correction, 450 white-shirt/gold-glasses compositions were rendered and visually reviewed again.
- Browser preview is unavailable in this environment. Canvas image checks and DOM/map mocks do not replace a live-device map smoke check.

No production trip records were changed by these fixes or their tests. The giant-frame concept is not included in runtime assets.
