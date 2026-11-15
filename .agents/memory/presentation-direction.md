---
name: NES presentation direction
description: User's standing visual direction and audio boundaries for Kick Return ’86.
---

Kick Return ’86 should look like a believable late-NES football game from roughly 1986–1988, adapted for mobile, not a modern mobile app or SaaS dashboard. Use sharp pixel art, square frames, a night stadium, chrome/white/blue lettering, and red accents inspired by the supplied icon artwork.

**Why:** The user explicitly requested a cohesive visual redesign while preserving all modes, game logic, and saved progress.

**How to apply:** Keep title, Franchise management, and supporting interfaces visually consistent. Keep browser audio activation restrictions in mind and preserve existing gameplay sounds. Follow the intro/menu audio boundaries below.

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

The opening video should recreate a natural catch and return with bolder, sharp NES-inspired pixel art. Prefer the actual game sprites and movement language over filtering the old supplied video. Preserve aspect-fit presentation without stretching, aggressive cropping, teal frames or decorative padding.

**Why:** The user explicitly asked to redo the intro with bolder colors, recreated 8-bit graphics and catch/return timing more like the game.

**How to apply:** Use nearest-neighbor enlargement of genuinely lower-resolution artwork, not a blur filter. Preserve important title/player artwork when fitting different screen shapes.

Preserve the supplied ’86 field lettering design. Treat it as slightly faded, smaller, worn pixel paint integrated into the turf, not a clean floating decal.

**Why:** The user explicitly liked the existing lettering and requested restrained wear rather than a redesign.

**How to apply:** Keep regular-season Franchise placement and playoff exclusions; use sparse deterministic missing pixels and modest fading without making the lettering unrecognizable.

Call the championship game **Super Cup**, not Super Bowl.

**Why:** The user explicitly requested this name for all mentions and animations.

**How to apply:** Use Super Cup in future UI text, championship presentations, spoken announcements, and generated promotional media.

Keep a visible 0.7-second downed-player pause after the complete tackle impact and fall animations.

**Why:** The user explicitly chose 0.7 seconds instead of retaining the existing one-second hold.

**How to apply:** Preserve this separate pause during future player-art or presentation changes; do not shorten the impact or fall to make the total animation last 0.7 seconds.

The TOUCHDOWN sign uses separate, visibly spaced NES pixel bulbs, not connected bitmap strokes. Use deterministic warm brightness variations and a minimal dark stadium-sign background. Illuminate dim for about 0.4 seconds, then bright for 2 seconds, once, without smooth glow or continuous flashing.

**Why:** The user refined the earlier pixelated-letter request to specifically require an individual-bulb stadium sign and a longer two-stage celebration.

**How to apply:** Share the bulb artwork and palette threshold across Classic and Full Game. Preserve touchdown scoring and sounds; the longer presentation must not consume game-clock time.
