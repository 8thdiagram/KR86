---
name: Large diagnostic evidence
description: Delivering complete raw simulation evidence within the asset-size limit.
---

Keep each delivered asset below 100 MiB.

**Why:** Asset registration explicitly rejected a complete experimental-evidence ZIP exceeding the 104,857,600-byte per-file limit.

**How to apply:** Split large raw trial exports into independently readable ZIPs below 90 MB and deliver the report/scripts separately. Include a part index and shared file-hash manifest; verify that the union of parts contains every trial before removing a superseded oversized generated archive.
