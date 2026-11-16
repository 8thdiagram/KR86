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

Headless Chromium can list built-in extension background pages before its actual browser tab.

**Why:** A background page accepts a debugger connection but can stall ordinary navigation and screenshot requests.

**How to apply:** Select the explicitly created target by its returned ID, or filter for `type === 'page'`; never assume the first debugger target is the app.

Generate natural gameplay replay fixtures through the public game step at the same time scale as the browser, not by stepping the local field solver alone.

**Why:** The public engine reflects and stabilizes world coordinates and applies the live time scale. A local-solver snapshot near a handoff or move threshold can produce a different next action when replayed through the full browser engine, despite identical-looking geometry.

**How to apply:** Use the public engine for end-to-end replay provenance, preserve its field-frame metadata, and select an already-running encounter that remains live long enough to inspect. Keep local solver tests for isolated deterministic physics comparisons.
