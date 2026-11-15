---
name: Presentation lifecycle and audio verification
description: Stable animation ownership and the limits of this workspace's headless audio verification.
---

Animation timing must belong to a stable render session, not a temporary interpolated state snapshot. Advance pose cadence independently of gameplay movement.

**Why:** Classic simulation and interpolation replace their state objects frequently. Using those objects as animation-clock identities resets strides every frame even when a clock's isolated timing tests pass.

**How to apply:** Exercise the actual renderer with successive simulation/interpolation snapshots, not only the timing helper. Preserve movement speeds, collision physics, authored sprites and action poses.

Validate continuous gameplay flow with time-series render measurements, not only still screenshots and isolated animation-clock tests.

**Why:** Extensive static view checks passed while the user still experienced jumpy ball movement, camera scrolling and overall play. Static correctness does not establish fluid movement or a sustainable frame budget.

**How to apply:** Exercise kickoff, pass release, catch/contact and scrolling transitions in the real frame loop at phone sizes. Track visible ball positions, camera transforms and frame costs together; keep physical-device limitations explicit. Draw duration is not delivered FPS: report the paint benchmark as such, not as proof of a physical device's frame rate.

Verify sound-event timing separately from sound waveforms and physical-device playback.

**Why:** This workspace's headless Chromium can report a running audio context while its live audio clock stays frozen. A zero live analyser reading alone does not establish that the game's sound has become silent. Offline Web Audio rendering can still verify the original waveforms.

**How to apply:** Check original effect scheduling against real engine events, render the original buffers/oscillator automation offline when the live clock stalls, and state plainly when physical iPhone speakers/Safari were not verified. Do not replace original sounds merely to accommodate a headless output limitation.
