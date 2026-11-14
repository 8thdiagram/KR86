---
name: Browser touch verification
description: Browser-testing constraints that prevent false failures in saved games and multi-touch controls.
---

Use an isolated browser context for game-control checks. For partial Chrome DevTools Protocol touch-end events, identify the contact being released, not the contacts that remain pressed. An empty touch list releases everything.

**Why:** Inherited browser storage can resume a paused game instead of the intended test state. Supplying the remaining contact to a partial touch-end event releases that contact instead, making correct controls appear stuck.

**How to apply:** Keep real user saves intact. Verify both partial-release directions against the sampled physical input state, not merely the resulting player motion; existing inertia, blocking and committed animations can legitimately delay a movement change.
