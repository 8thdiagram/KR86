---
name: Retro presentation direction
description: User's standing visual direction and audio boundaries for Kick Return ’86.
---

Kick Return ’86 should look as close as possible to the supplied football screenshot, adapted for mobile rather than a modern mobile app or SaaS dashboard. The latest player-art direction favors less pixelated, smoother and more readable athletes. Keep crisp separated colors, square interface frames, a stadium setting, chrome/white/blue lettering, and red accents inspired by the supplied icon artwork.

**Why:** The user superseded the earlier deliberately pixelated NES-only brief with “Make the players less pixelated and smoother” and “Overall, they need to be easier to see like in the reference picture here.”

**How to apply:** Use finer authored contours and coherent readable shapes rather than extra coarse pixel noise. Do not blur the entire game to smooth athletes. Preserve animation timing, gameplay and saves. Keep title, Franchise management and supporting interfaces visually consistent; follow the separate intro/menu/audio boundaries below.

Keep players lean and athletic, with longer articulated legs and finer, smoother silhouettes. Keep helmets readable and clearly separated from the jersey; do not make whole sprites wider simply to add detail.

**Why:** The user explicitly asked to “make their legs longer” and make players easier to see in the reference, superseding the earlier fixed-proportions rule.

**How to apply:** Apply the athletic anatomy across standing, turning, spinning, diving, falling and kicking artwork. Lengthen the visual legs while preserving ground anchors, collision geometry, speeds and action timing. Use finer authored shapes, not a scaled-up low-detail bitmap.

Keep the overall sprites a little smaller while retaining the athletic proportions. Give helmets a defined shell and a visibly protruding, open facemask, not just a face slit.

**Why:** The user refined the larger athletic sprites with “Make the sprites a little smaller, define their helmets better ... Add face masks.”

**How to apply:** Reduce visual scale modestly around unchanged foot anchors, not collision bodies. Preserve secondary-color helmets and matching cage rails, showing turf through the outer cage opening so masks remain readable on phones. Apply to Classic, Full Game and special teams.

Prioritize clear individual sprites: white pants, solid primary-team-color jerseys and sleeves, secondary-team-color helmets, and readable helmet-colored facemasks. No secondary stripes or blocks on the jerseys. Use dark definition to separate limbs and external silhouettes, not to create black face panels or cages. Do not add decorative lines around downed players.

**Why:** The user specified “make the jerseys one color which is the primary team color separated from the helmet, which is the secondary team color.” Earlier they found detailed sprites and lines around grounded players messy.

**How to apply:** Use broad uninterrupted jersey color, contrasting helmet identity and clean grounded poses consistently across Classic, Full Game and special teams. Keep gameplay and animation timing unchanged; preserve team palettes used elsewhere.

Limit exposed face pixels and make facemask bars visible in the helmet's base team color. Remove black/navy recessed face panels and dark mask bars from athlete faces, including moving, turned and grounded poses. Use varied skin tones assigned consistently by player position, including hands and tackled poses.

**Why:** The user explicitly asked for less visible flesh, clearer helmet-colored facemasks and different stable skin tones per position, then reiterated “Remove the black from their faces. Make facemasks the same color as the helmets.”

**How to apply:** Derive cosmetic tone from roster role or special-teams duty at render time, not from animation frame or a changing uniform. Keep masks legible through stepped helmet corners, a small skin opening and separated matching-color rails, rather than reintroducing a dark recess. Keep this separate from gameplay, physics, and saved player state.

Normal gameplay should resemble the supplied 16-bit football reference: near-overhead, left-to-right, with modest broadcast depth, horizontal sidelines and far-side compression. The user approved the far sideline and asked to stretch only the near sideline further. Preserve that far-side view in future refinements unless explicitly asked to change it. Match the reference, not a rigid ten-degree preset. Never make it an isometric or dramatic low sideline camera.

**Why:** The user rejected earlier steep perspectives and explicitly prioritized readable overhead play with modest television-style depth, then said “The far sideline looks good.”

**How to apply:** Keep projection render-only and consistent for field paint, artwork, athlete anchors, balls and shadows. Keep actual team colors, HUD, controls, camera-follow behavior and all football coordinates intact; never skew the entire screen. Preserve the separate behind-the-kicker Kick View. Use disciplined textured greens, readable bitmap numbers, restrained contact shadows and team-colored pixel people within available stadium space, without shrinking the field merely for decoration.

Keep the referee slightly higher and fully visible in landscape, with all touchdown and possession signals moving with him. Preserve portrait placement.

**Why:** The user specifically asked to move the referee up so he is easier to see in landscape mode.

**How to apply:** Adjust only the referee artwork's position to fit the visible apron; do not shrink the field, alter the approved camera, or change gameplay.

For app icons, preserve the latest supplied artwork and use a subtle, sharp iPhone-style edge finish.

**Why:** The user requested this finish for replacement app icons.

**How to apply:** Keep installed icons opaque and square so iOS applies its own rounded mask. Avoid large borders or heavy gloss, and do not substitute app-icon artwork for the separately chosen menu or intro.

A subtle 1980s-TV overlay should cover all intros, videos, menus, and gameplay without becoming distracting.

**Why:** The user explicitly requested a subtle TV effect across the entire experience.

**How to apply:** Favor faint static scanlines and slight edge shading, keeping text and play clear. Treat it as one shared display effect rather than stacking a stronger second treatment over videos.

The home/menu artwork should be a screenshot from the existing intro showing KR ’86, replacing the gameplay screenshot and separate overlaid KICK RETURN title. Preserve the complete intro composition, lettering and runner with crisp pixel scaling and no duplicate logo or year over it.

**Why:** The user explicitly changed the home-screen direction to an intro screenshot that says KR ’86.

**How to apply:** Keep the selected menu frame uncropped and readable in portrait and landscape, with normal scrolling to mode/device options. The newer 32-bit opening request changes the opening only, not this menu artwork or the app icon.

The title mode choices and device update/backup/install options belong to one continuous scrolling screen. Do not use an expandable tools section, a SELECT / ENTER CONFIRM / BATTERY BACKUP READY footer, or a viewport-height gap between the menu and device options.

**Why:** The user wants to scroll normally and see all options without opening a separate panel.

**How to apply:** Keep shared scrolling limited to the title menu, not gameplay. Preserve update actions, backup controls and destructive-import confirmation.

The opening/title/menu presentation has no original video audio or “hut.” Preserve intro sound effects, but start music only when the menu appears. The menu theme should be an original, celebratory Super Cup football cue with richer 32-bit-era console sound: chip melody, low synth bass, brass-style accents and supporting drums. Give it developed phrases and a resolved ending. Play once, not a continuous loop.

**Why:** The user superseded the eight-bit-only soundtrack with “Create a 32 bit NES era football game music super cup theme to play on the menu screen.” They previously requested sound-on automatic startup without a separate prompt and removed looping/title cadence.

**How to apply:** Keep source video audio out of playback. Prevent ready/visibility events from replaying a completed theme or stacking music. Start automatically with sound enabled; never display a “Start with sound” option or block the intro waiting for audio. Where browsers require a gesture, use the first ordinary tap/key to unlock sound without a separate prompt or restarting the intro. Respect browser restrictions and preserve gameplay cadence. Stop title music for replay, gameplay or a hidden page. Do not display skip-intro or mute-sound options.

The complete opening sequence should last 4–5 seconds and use richer 32-bit-era console graphics. Keep a football runner, stadium and KR ’86 / Super Cup identity, with dimensional low-poly shading and clear composition. Preserve the menu's separately chosen intro screenshot and the app icon.

**Why:** The user explicitly replaced the older NES-only, original-video timing direction with “The opening sequence make it only 4 to 5 seconds and use 32 bit era graphics to render the opening scene.”

**How to apply:** Interpret the mixed “32 bit NES era” phrasing as richer mid-1990s retro-console presentation, not a literal NES hardware limit. Count the entire opening, including black/logo stages, within the time budget; do not let video loading extend it. Aspect-fit the artwork in both orientations. Keep reduced-motion presentation static without extending the duration.

Preserve the supplied ’86 field lettering design. Treat it as slightly faded, smaller, worn pixel paint integrated into the turf, not a clean floating decal.

**Why:** The user explicitly liked the existing lettering and requested restrained wear rather than a redesign.

**How to apply:** Keep regular-season Franchise placement and playoff exclusions; use sparse deterministic missing pixels and modest fading without making the lettering unrecognizable.

End-zone team names should also look like worn, textured field paint, matching the midfield logo rather than clean outlined decals.

**Why:** The user explicitly requested worn/texturized end-zone names like the midfield logo.

**How to apply:** Preserve readable team lettering and colors, using subtle fading and fixed native-pixel scuffs that do not shimmer as the camera moves.

Call the championship game **Super Cup**, not Super Bowl.

**Why:** The user explicitly requested this name for all mentions and animations.

**How to apply:** Use Super Cup in future UI text, championship presentations, spoken announcements, and generated promotional media.

Keep a visible 0.7-second downed-player pause after the complete tackle impact and fall animations.

**Why:** The user explicitly chose 0.7 seconds instead of retaining the existing one-second hold.

**How to apply:** Preserve this separate pause during future player-art or presentation changes; do not shorten the impact or fall to make the total animation last 0.7 seconds.

The TOUCHDOWN sign uses separate, visibly spaced NES pixel bulbs, not connected bitmap strokes. Use deterministic warm brightness variations and a minimal dark stadium-sign background. Illuminate dim for about 0.4 seconds, then bright for 2 seconds, once, without smooth glow or continuous flashing.

**Why:** The user refined the earlier pixelated-letter request to specifically require an individual-bulb stadium sign and a longer two-stage celebration.

**How to apply:** Share the bulb artwork and palette threshold across Classic and Full Game. Preserve touchdown scoring and sounds; the longer presentation must not consume game-clock time.

Give TOUCHDOWN lettering clear dark space inside its individual-bulb outline on all four sides; enlarge the board, not the border thickness.

**Why:** The user found the illuminated letters too close to the frame, especially at normal iPhone size.

**How to apply:** Preserve separate lamps, restrained brightness variation, letter spacing, two-stage timing, and responsive portrait/landscape fitting.
