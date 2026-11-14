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

The home/menu artwork should be an actual in-game screenshot. Keep the large, recognizable italic KICK-over-RETURN lettering and ’86 in the lower-right corner. Author the title with unmistakable square-pixel clusters, stair-stepped edges, white/silver/blue bands, dark outlines and dimensional gray shadows, not a generic font, smooth gradients, antialiasing, blur or glow. Preserve its established position and surrounding artwork without overlaps.

**Why:** The user replaced the earlier NES-illustration direction with an explicit request for an in-game screenshot, keeping the Kick Return text and adding ’86 at the lower right.

**How to apply:** Use a frame from actual gameplay, not an invented gameplay-like illustration. Prefer genuinely authored pixel geometry and nearest-neighbor scaling; inspect normal and enlarged high-density mobile sizes in both orientations. Do not replace the separately supplied intro video or app icon merely to match menu artwork.

The title mode choices and device update/backup/install options belong to one continuous scrolling screen. Do not use an expandable tools section, a SELECT / ENTER CONFIRM / BATTERY BACKUP READY footer, or a viewport-height gap between the menu and device options.

**Why:** The user wants to scroll normally and see all options without opening a separate panel.

**How to apply:** Keep shared scrolling limited to the title menu, not gameplay. Preserve update actions, backup controls and destructive-import confirmation.

The supplied intro video is for visuals only: no original sound and no “hut” anywhere in the opening/title/menu presentation. Preserve other intro effects. As the main title/menu appears, play one original 5–6-second, lower-pitched, bass-forward, triumphant late-NES football fanfare with prominent triangle bass, lower pulse melody/harmony, restrained noise percussion and a resolved ending. Then remain silent except for ordinary selection effects; never loop it.

**Why:** The user explicitly replaced the title cadence and continuous menu music with a short, once-only championship fanfare, avoiding shrill, busy or repetitive music.

**How to apply:** Keep source video audio out of playback. Prevent ready/visibility events from replaying a completed fanfare or stacking music. Preserve existing mute behavior, mobile activation restrictions and the actual gameplay “hut.” Where autoplay requires a gesture, offer Start with sound. Stop title music for replay, gameplay or a hidden page. Do not display skip-intro or mute-sound options.

The opening video should use visibly low-resolution, sharp pixels and a limited NES-inspired palette, with no teal frame or decorative padding. Preserve the original composition and timing rather than stretching or aggressively cropping it.

**Why:** The user wanted the supplied opening to match the rest of the late-NES presentation rather than look high-resolution and smooth.

**How to apply:** Use nearest-neighbor enlargement of genuinely lower-resolution artwork, not a blur filter. Preserve important title/player artwork when fitting different screen shapes.

Preserve the supplied ’86 field lettering design. Treat it as slightly faded, smaller, worn pixel paint integrated into the turf, not a clean floating decal.

**Why:** The user explicitly liked the existing lettering and requested restrained wear rather than a redesign.

**How to apply:** Keep regular-season Franchise placement and playoff exclusions; use sparse deterministic missing pixels and modest fading without making the lettering unrecognizable.

Call the championship game **Super Cup**, not Super Bowl.

**Why:** The user explicitly requested this name for all mentions and animations.

**How to apply:** Use Super Cup in future UI text, championship presentations, spoken announcements, and generated promotional media.
