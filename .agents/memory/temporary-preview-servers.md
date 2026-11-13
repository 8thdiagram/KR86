---
name: Temporary preview servers
description: Avoid leaving the workspace preview connected to a temporary asset server.
---

Temporary HTTP servers used to inspect generated assets can become the workspace's forwarded preview port, even when they are not managed workflows.

**Why:** A temporary slide-preview server displaced the game preview mapping; a later restart built successfully but could not satisfy the app's expected preview port.

**How to apply:** Prefer file-based browser rendering for generated assets. If a temporary server is needed, stop it afterward and preserve the application's forwarding configuration; keep the game preview on port 5000.
