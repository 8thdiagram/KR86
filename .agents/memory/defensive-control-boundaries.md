---
name: Defensive ACTION control boundaries
description: CPU defense by default with a narrowly authorized human hold/release panic-positioning control.
---

Defensive movement is CPU-controlled by default. The user authorized this human ACTION exception: a 180 ms HOLD selects the deepest eligible defender once, retreating toward his own goal line. It works during dropbacks and airborne passes, initially preserving the defender's coverage lane; after a catch or on a run, track the carrier's actual lateral position. UP/DOWN while held offsets that destination, not the player's position or velocity. RELEASE immediately restores ordinary CPU coverage/pass defense/pursuit from the actual physical state. No persistent selection, added highlight system or general manual-defense mode.

**Why:** The user previously removed broad manual defense, then requested the panic switch and explicitly expanded it to pre-pass coverage, bounded trajectory adjustments and ordinary held automatic tackles. Anticipating incorrectly must leave real coverage weaknesses rather than trigger compensating AI improvements.

**How to apply:** Keep the override transient and human-only. Use normal speeds, acceleration, turning, collision and assignments, in both field orientations and supported return situations. Preserve the selected identity through the throw and catch; never transfer to another defender when the selected athlete is blocked or diving. A pre-pass/airborne retreat must not follow the QB or the eventual receiver. Restore normal CPU reads without a post-release timer or velocity snap. Preserve offensive controls, diagrams, animations, presentation, modes and saved progress.

Quick defensive ACTION taps retain ordinary nearest-eligible-defender tackle/intercept/recovery rules. A sustained hold automatically attempts an ordinary dive by the selected defender when a legitimate runner is in range, using existing admission, cooldowns, contact, ratings, animations and sounds. Never tackle an uncaught receiver or a QB still operating as a passer behind the line. Normal pass contests remain possible against an observable nearby ball. Releasing a sustained hold never launches another action. Do not interrupt or home a committed dive, spam new launches while unavailable, or serialize held state.

**Why:** The user explicitly wants to keep holding through the tackle opportunity without releasing and tapping again, while preserving genuine misses and offensive escapes. Positioning and an admitted attempt must not guarantee a tackle or interception.

**How to apply:** Use the existing ordinary action functions, restricting only held automatic attempts to the selected defender. Quick taps must not acquire that restriction. Preserve held retreat timing, contact rules and recovery.

Rear-pursuit ACTION taps should launch a reachable chasing defender immediately rather than stop him in a stationary plant. A well-timed dive should usually catch a straight-running carrier, but a cut or juke can still evade it.

**Why:** The user reported close chasing defenders freezing on ACTION and explicitly requested an effective immediate rear dive.

**How to apply:** Commit to observed motion once, without homing, forced tackles or enlarged contact boxes. Keep held retreat, pass contests, sprite size and control geometry unchanged.

The user requested more effective defensive dives, no apparent sprite shrinking during dives, and smarter, more cautious defensive backs/safeties. The panic-switch request does not authorize additional automatic pursuit or broad balance changes.

**Why:** The user explicitly requested these defensive improvements after the controls-only restoration.

**How to apply:** Preserve contact-based outcomes, committed non-homing dives, misses and recovery costs, play assignments, and shared mechanics for both teams.

Keep the existing early penetration lottery and independent 20% per-lineman pressure checks beginning at **three seconds**.

**Why:** The uploaded restoration brief said four seconds, but the user explicitly confirmed retaining the current three-second timing when asked.

**How to apply:** Treat the reset as controls-only. Do not change pressure timing, blitz mechanics, or add duplicate penetration chances.
