---
name: NES presentation direction
description: User's standing visual direction and audio boundaries for Kick Return ’86.
---

Kick Return ’86 should look like a believable late-NES football game from roughly 1986–1988, adapted for mobile, not a modern mobile app or SaaS dashboard. Use sharp pixel art, crisp separated colors, slightly larger readable player sprites, square frames, a night stadium, chrome/white/blue lettering, and red accents inspired by the supplied icon artwork.

**Why:** The user explicitly requested a cohesive visual redesign while preserving all modes, game logic, and saved progress, then supplied a classic NES screenshot as a reference for sharper graphics, crisper colors, and slightly larger sprites.

**How to apply:** Keep title, Franchise management, and supporting interfaces visually consistent. Keep browser audio activation restrictions in mind and preserve existing gameplay sounds. Follow the intro/menu audio boundaries below.

Keep the current enlarged player height. Favor slightly leaner equipped bodies and smaller helmets, with fluid late-NES pixel poses rather than blur, anti-aliasing, whole-sprite compression, or altered movement physics.

**Why:** The user explicitly liked the new height but requested approximately 5–8% narrower bodies, 5–10% smaller helmets, and more natural animation while preserving all gameplay behavior.

**How to apply:** Refine native pixel clusters across standing, turning, spinning, diving, falling, and kicking artwork. Keep foot anchors, helmet depth, uniform details, collision geometry, speeds, and action timing intact.

Prioritize clear individual sprites: more white on pants, more primary team color on jerseys and helmets, and clear dark definition for facemasks and separating players. Do not add decorative lines around downed players.

**Why:** The user found the detailed sprites and lines around grounded players messy and asked for simpler, clearer uniforms and individual silhouettes.

**How to apply:** Use broad readable color clusters, small secondary accents, minimal internal shading, and clean grounded poses. Keep gameplay, height, and animation timing unchanged; increase artwork resolution only if clarity requires it.

Limit exposed face pixels and make facemask bars visible in the helmet's base team color. Use varied skin tones assigned consistently by player position, including hands and tackled poses.

**Why:** The user explicitly asked for less visible flesh, clearer helmet-colored facemasks, and different stable skin tones per position.

**How to apply:** Derive cosmetic tone from roster role or special-teams duty at render time, not from animation frame or a changing uniform. Keep this separate from gameplay, physics, and saved player state.

Normal gameplay should resemble the supplied late-NES football reference: near-overhead, left-to-right, with gentle broadcast depth, horizontal sidelines and slight far-side compression. Match the reference, not a rigid ten-degree preset. Never make it an isometric or dramatic low sideline camera.

**Why:** The user rejected earlier steep perspectives and explicitly prioritized readable overhead play with modest television-style depth.

**How to apply:** Keep projection render-only and consistent for field paint, artwork, athlete anchors, balls and shadows. Keep upright sprite height/proportions, actual team colors, HUD, controls, camera-follow behavior and all football coordinates intact; never skew the entire screen. Preserve the separate behind-the-kicker Kick View. Use disciplined textured greens, readable bitmap numbers, restrained contact shadows and team-colored pixel people within available stadium space, without shrinking the field merely for decoration.

For app icons, preserve the latest supplied artwork and use a subtle, sharp iPhone-style edge finish.

**Why:** The user requested this finish for replacement app icons.

**How to apply:** Keep installed icons opaque and square so iOS applies its own rounded mask. Avoid large borders or heavy gloss, and do not substitute app-icon artwork for the separately chosen menu or intro.

A subtle 1980s-TV overlay should cover all intros, videos, menus, and gameplay without becoming distracting.

**Why:** The user explicitly requested a subtle TV effect across the entire experience.

**How to apply:** Favor faint static scanlines and slight edge shading, keeping text and play clear. Treat it as one shared display effect rather than stacking a stronger second treatment over videos.

The home/menu artwork should be a screenshot from the existing intro showing KR ’86, replacing the gameplay screenshot and separate overlaid KICK RETURN title. Preserve the complete intro composition, lettering and runner with crisp pixel scaling and no duplicate logo or year over it.

**Why:** The user explicitly changed the home-screen direction to an intro screenshot that says KR ’86.

**How to apply:** Use the actual intro frame, not a recreation or new illustration. Keep it uncropped and readable in portrait and landscape, with normal scrolling to the mode/device options. Do not replace the separately supplied intro video or app icon.

The title mode choices and device update/backup/install options belong to one continuous scrolling screen. Do not use an expandable tools section, a SELECT / ENTER CONFIRM / BATTERY BACKUP READY footer, or a viewport-height gap between the menu and device options.

**Why:** The user wants to scroll normally and see all options without opening a separate panel.

**How to apply:** Keep shared scrolling limited to the title menu, not gameplay. Preserve update actions, backup controls and destructive-import confirmation.

The supplied intro video is for visuals only: no original sound and no “hut” anywhere in the opening/title/menu presentation. Preserve other intro effects. As the main title/menu appears, play an upbeat, celebratory, slightly longer NES football theme with better pacing, prominent triangle bass, pulse melody/harmony, restrained percussion and a resolved ending. Then remain silent except for ordinary selection effects; never loop it.

**Why:** After removing the title cadence and continuous loop, the user requested a more upbeat, celebratory song with better pacing and a little more length, retaining eight-bit technology. They also requested sound-on automatic startup without a separate prompt.

**How to apply:** Keep source video audio out of playback. Prevent ready/visibility events from replaying a completed theme or stacking music. Start automatically with sound enabled; never display a “Start with sound” option or block the intro waiting for audio. Where browsers require a gesture, use the first ordinary tap/key to unlock sound without a separate prompt or restarting the intro. Respect browser restrictions and preserve gameplay cadence. Stop title music for replay, gameplay or a hidden page. Do not display skip-intro or mute-sound options.

The opening video should use visibly low-resolution, sharp pixels and a limited NES-inspired palette, with no teal frame or decorative padding. Preserve the original composition and timing rather than stretching or aggressively cropping it.

**Why:** The user wanted the supplied opening to match the rest of the late-NES presentation rather than look high-resolution and smooth.

**How to apply:** Use nearest-neighbor enlargement of genuinely lower-resolution artwork, not a blur filter. Preserve important title/player artwork when fitting different screen shapes.

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
