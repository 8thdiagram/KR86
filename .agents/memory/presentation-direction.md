---
name: NES presentation direction
description: User's standing visual direction and audio boundaries for Kick Return ’86.
---

Kick Return ’86 should look like a believable late-NES football game from roughly 1986–1988, adapted for mobile, not a modern mobile app or SaaS dashboard. Use sharp pixel art, square frames, a night stadium, chrome/white/blue lettering, and red accents inspired by the supplied icon artwork.

**Why:** The user explicitly requested a cohesive visual redesign while preserving all modes, game logic, and saved progress.

**How to apply:** Keep title, Franchise management, and supporting interfaces visually consistent. Keep browser audio activation restrictions in mind and preserve existing gameplay sounds. Follow the intro/menu audio boundaries below.

A subtle 1980s-TV overlay should cover all intros, videos, menus, and gameplay without becoming distracting.

**Why:** The user explicitly requested a subtle TV effect across the entire experience.

**How to apply:** Favor faint static scanlines and slight edge shading, keeping text and play clear. Treat it as one shared display effect rather than stacking a stronger second treatment over videos.

The home/menu artwork should be an actual in-game screenshot. Keep the large, recognizable Kick Return lettering and ’86 in the lower-right corner. Refine the lettering with discrete white/silver/blue bands and dark outlines, not smooth gradients, blur or glow. Balance its position within the artwork without overlapping the mode menu.

**Why:** The user replaced the earlier NES-illustration direction with an explicit request for an in-game screenshot, keeping the Kick Return text and adding ’86 at the lower right.

**How to apply:** Use a frame from actual gameplay, not an invented gameplay-like illustration. Do not replace the separately supplied intro video or app icon merely to match menu artwork.

The title mode choices and device update/backup/install options belong to one continuous scrolling screen. Do not use an expandable tools section, a SELECT / ENTER CONFIRM / BATTERY BACKUP READY footer, or a viewport-height gap between the menu and device options.

**Why:** The user wants to scroll normally and see all options without opening a separate panel.

**How to apply:** Keep shared scrolling limited to the title menu, not gameplay. Preserve update actions, backup controls and destructive-import confirmation.

The supplied intro video is for visuals only: no original sound and no “hut” during the video. Preserve the other intro effects, then play the game's own “hut” once as the main title/menu appears. Do not display skip-intro or mute-sound options. Menu music should be a restrained, bass-forward, triumphant late-NES football theme: strong simple melody, short varied phrases, subtle pulse harmony, steady march and quiet percussion at background volume.

**Why:** The user moved the cadence from the video to title entry, and found the earlier championship tune repetitive and irritating. They explicitly requested prominent triangle bass, lower-register phrases and restrained drums instead of shrill, busy notes.

**How to apply:** Keep source video audio out of playback. Decode the cadence ahead of time without playing it during the video, announce it once at title entry, and prevent repeated ready/visibility events from duplicating it. Preserve existing mute behavior and gameplay cadence. Where autoplay requires a gesture, offer Start with sound. Play music only on the menu, stopping it for replay, gameplay or a hidden page. Do not restore skip or mute controls.

The opening video should use visibly low-resolution, sharp pixels and a limited NES-inspired palette, with no teal frame or decorative padding. Preserve the original composition and timing rather than stretching or aggressively cropping it.

**Why:** The user wanted the supplied opening to match the rest of the late-NES presentation rather than look high-resolution and smooth.

**How to apply:** Use nearest-neighbor enlargement of genuinely lower-resolution artwork, not a blur filter. Preserve important title/player artwork when fitting different screen shapes.

Preserve the supplied ’86 field lettering design. Treat it as slightly faded, smaller, worn pixel paint integrated into the turf, not a clean floating decal.

**Why:** The user explicitly liked the existing lettering and requested restrained wear rather than a redesign.

**How to apply:** Keep regular-season Franchise placement and playoff exclusions; use sparse deterministic missing pixels and modest fading without making the lettering unrecognizable.

Call the championship game **Super Cup**, not Super Bowl.

**Why:** The user explicitly requested this name for all mentions and animations.

**How to apply:** Use Super Cup in future UI text, championship presentations, spoken announcements, and generated promotional media.
