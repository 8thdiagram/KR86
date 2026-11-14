---
name: NES presentation direction
description: User's standing visual direction and audio boundaries for Kick Return ’86.
---

Kick Return ’86 should look like a believable late-NES football game from roughly 1986–1988, adapted for mobile, not a modern mobile app or SaaS dashboard. Use sharp pixel art, square frames, a night stadium, chrome/white/blue lettering, and red accents inspired by the supplied icon artwork.

**Why:** The user explicitly requested a cohesive visual redesign while preserving all modes, game logic, and saved progress.

**How to apply:** Keep title, Franchise management, and supporting interfaces visually consistent. Intro music is short and finite; the static main menu has interaction effects only, never looping background music. Keep browser audio activation restrictions in mind and preserve existing gameplay sounds.

A subtle 1980s-TV overlay should cover all intros, videos, menus, and gameplay without becoming distracting.

**Why:** The user explicitly requested a subtle TV effect across the entire experience.

**How to apply:** Favor faint static scanlines and slight edge shading, keeping text and play clear. Treat it as one shared display effect rather than stacking a stronger second treatment over videos.

The home/menu artwork should be an actual in-game screenshot. Keep the large Kick Return title and add ’86 in the lower-right corner. Retain flat pixel styling rather than smooth metallic lighting, gradients, blur, or glow.

**Why:** The user replaced the earlier NES-illustration direction with an explicit request for an in-game screenshot, keeping the Kick Return text and adding ’86 at the lower right.

**How to apply:** Use a frame from actual gameplay, not an invented gameplay-like illustration. Do not replace the separately supplied intro video or app icon merely to match menu artwork.

The supplied intro video is for visuals only. Do not use its original sound; pair it with a short, simple, low-pitched 8-bit cue, with fewer drums and the game's own “hut” at the end. Play sounds on startup.

**Why:** The user requested replacing the uploaded clip's sound, then asked for less percussion, a shorter and simpler low-pitched soundtrack inspired by game sounds, the actual game “hut,” and startup sound playback.

**How to apply:** Keep source audio out of playback and stop the replacement theme when the intro ends or is skipped. Attempt automatic audio; where browser autoplay restrictions require a gesture, offer Start with sound before running the intro silently. Keep mute and silent idle-menu behavior intact.

Call the championship game **Super Cup**, not Super Bowl.

**Why:** The user explicitly requested this name for all mentions and animations.

**How to apply:** Use Super Cup in future UI text, championship presentations, spoken announcements, and generated promotional media.
