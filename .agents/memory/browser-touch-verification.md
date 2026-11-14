---
name: Browser touch verification
description: Browser-testing constraints that prevent false failures in saved games and multi-touch controls.
---

Use an isolated browser context for game-control checks. For partial Chrome DevTools Protocol touch-end events, identify the contact being released, not the contacts that remain pressed. An empty touch list releases everything.

**Why:** Inherited browser storage can resume a paused game instead of the intended test state. Supplying the remaining contact to a partial touch-end event releases that contact instead, making correct controls appear stuck.

**How to apply:** Keep real user saves intact. Verify both partial-release directions against the sampled physical input state, not merely the resulting player motion; existing inertia, blocking and committed animations can legitimately delay a movement change.

Visibility tests also activate the retained-game host's pause overlay, including on the title menu. Restoring document visibility does not automatically dismiss it.

**Why:** A legitimate pause overlay makes later replay/menu clicks inert; that is not a broken click handler or audio lifecycle.

**How to apply:** After a hidden/visible audio check, resume through the host's existing pause dialog before testing other controls. Inspect the rendered overlay before changing input simulation.
