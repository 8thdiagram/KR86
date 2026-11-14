---
name: Defensive control boundaries
description: User's preservation priorities for intelligent manual defense.
---

Defensive ACTION fires the original nearest-eligible-defender action immediately on press, irrespective of the highlighted player. Holding ACTION must never control movement, pursue the quarterback or carrier, wait for a tap/hold threshold, repeat the action, or fire another action on release.

**Why:** The user explicitly removed the defensive control experiments and restored original ACTION timing and eligibility; a nearby lineman must remain eligible for a sack even when the highlighted linebacker is far away.

**How to apply:** Keep ACTION independent of selection and arrow ownership. Preserve its original context, contact requirements, probabilities, cooldowns and animations, including when an arrow is also held.

Always select the existing middle linebacker during normal defensive plays, regardless of the defensive call. If absent, use appropriate existing central defensive personnel based on their formation position. Do not move players to manufacture a linebacker or use hidden offensive knowledge.

**Why:** The user wants consistent selection, not a cornerback for Man or a safety for Prevent.

**How to apply:** Preserve formations, personnel, assignments and all unselected players' AI.

UP/DOWN temporarily overrides only the selected defender's movement direction with vertical strafing. No horizontal or diagonal pursuit, AI countersteering, assignment changes, hidden receiver tracking, or physical bonuses. Release arrows to resume the current original assignment immediately, even if ACTION remains held.

**Why:** The user wants direct, simple repositioning without the defender fighting input or becoming passive.

**How to apply:** Use the ball carrier's direct directional-response style at the defender's own legitimate lateral speed, without AI reaction slowdown or steering inertia. Keep ratings, blocking, collisions, committed animations and original eligible tackles/sacks/interceptions/breakups. Never initiate extra dives or interception attempts merely because the player is highlighted or an arrow is held: those selection-only actions caused animation locks and consumed the normal ACTION cooldown. On release, restore original AI steering toward the responsibility's current location, not starting coordinates; no teleport or boost.

Use the exact original offense target only during live defensive gameplay: white normally or with ACTION alone, yellow only while strafing. Remove selection targets from defensive play diagrams. On human kickoff coverage, highlight and strafe the existing kicker, preserving original nearest-defender ACTION and receiving controls.

**Why:** The user explicitly requested these feedback and kickoff boundaries to match the simplified controls.

**How to apply:** Arrow release immediately restores white and current coverage. Do not reintroduce red targets, diagram highlights or ACTION-driven yellow selection.
