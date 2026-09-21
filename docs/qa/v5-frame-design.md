# Flat Google Maps frame — v5

Approved A concept, revised to keep Google Maps a flat rectangular interactive surface.

- At 1280px and above, reserve a 180–240px right rail for the cropped Captain. A flat cream border surrounds the actual Google Maps viewport. The cap/hand overlap only the nearby edge; all decorative elements ignore pointer events.
- At 601–1279px, hide the frame and reclaim the entire map width.
- At 600px and below, show only a 30×68px peek at the right edge. The source image is 220px wide; it contains no separate map or background.
- The viewport owns the map controls, place card and click popup. Popup event coordinates use this viewport's offset, including the desktop inset.
- The frame moves by only 3px vertically (2px on mobile); the existing pause button and reduced-motion preference stop it.
- Existing selected-stop and route-walker behavior remains unchanged.

Assets made with the built-in image-generation tool: `dist/assets/studio/captain-frame-flat.webp` (800×1200) and `captain-frame-mobile.webp` (220×330). The reusable prompt was: “Isolated matte clay Captain Beer, red cap, blank face, long black hair/beard, one short bent arm and fingerless mitten beside the body; torso largely cropped, transparent alpha, no map, paper or UI.” The head and single hand carry the frame; the torso is concealed in a charcoal shirt and cropped off-screen.

Checks: existing npm tests plus viewport/popup coordinate integration tests. Asset alpha and dimensions verified. Browser/live Google Maps preview was unavailable; the separate responsive HTML is a layout demonstration, not a live-map screenshot. No production trip data changes.
