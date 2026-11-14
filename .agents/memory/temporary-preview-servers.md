---
name: Temporary preview servers
description: Avoid leaving the workspace preview connected to a temporary asset server.
---

Temporary HTTP servers used to inspect generated assets can become the workspace's forwarded preview port, even when they are not managed workflows.

**Why:** A temporary slide-preview server displaced the game preview mapping; a later restart built successfully but could not satisfy the app's expected preview port.

**How to apply:** Prefer file-based browser rendering for generated assets. If a temporary server is needed, stop it afterward and preserve the application's forwarding configuration; keep the game preview on port 5000.

Validate the actual external development URL, not just a local screenshot, after forwarding or workflow changes. Recheck after the environment has synchronized its port configuration.

**Why:** The phone's service worker kept showing an old menu while the public preview returned HTTP 502, even though local screenshots and builds passed. A corrected forwarding mapping also reverted once during environment synchronization.

**How to apply:** Check the external HTML, a bundled asset, and a fresh browser render. Repair forwarding before blaming caches. Never clear browser storage to fix an old menu: Franchise saves live there; use the existing safe menu update instead.
