---
name: Running ACTION boundaries
description: User-requested intelligent ball-carrier actions without changing passing, CPU defense or approved presentation.
---

Eligible human running ball carriers use ACTION immediately on press, not on release. With defenders still between the runner and the end zone: imminent closing rear pursuit → burst; head-on threat → out-and-back juke; side threat → spin away. Once no defenders remain between the runner and the end zone, disable the burst even if a pursuer is closing from behind; ACTION chooses a random spin or juke instead. End an existing burst when the final defender is passed. Threats are relative to actual travel, including diagonals and opposite-field returns; the clear-breakaway condition is relative to the attacking end zone, not the current diagonal heading. Holding ACTION must still halt forward progress, with legs running in place and up/down steering available; releasing resumes forward running without another evade. A committed spin or juke finishes before hold-to-halt takes over. This applies across Classic, kick returns, catches and turnover returns, using the same movement rules for human and CPU carriers.

**Why:** The user specifically requested intelligent running actions and clarified that hold-to-halt must remain. After confirming the spin worked and requesting 20% more travel, they expanded the system to four moves. They subsequently clarified that an open-field runner is already at top speed: clear-breakaway ACTION should randomly spin or juke, not accelerate.

**How to apply:** Spins move 1.74 rendered collision-body widths in authoritative world coordinates during a 0.34-second full turn; preserve forward momentum and the new lane. Spins and jukes share their entire initial 0.16-second outward movement. The juke cuts back during the remaining 0.18 seconds, returning to its original travel lane without undoing forward travel; its pose is a plant/partial lean, not a full rotation. Existing saved spins retain their original curves. CPU carriers choose useful threat-driven actions rather than constantly spinning in open space. Preserve the 24% burst for up to 0.42 seconds only while defense remains ahead, existing recovery, body/sideline collisions and ratings. Verify real tackle avoidance against straight running, not just displacement or rotation, and test held touchscreen presses as well as taps.

Defenders must not know whether the carrier selected a spin or juke, its future return point, or its remaining animation time. Their initial reactions to identical observed movement must be identical; only actual movement may change pursuit. Both natural misses and genuine contact tackles are legitimate.

**Why:** The user made identical defensive reactions the central requirement of the four-move system, explicitly prohibiting scripted delays, forced misses, freezing, slowdown or invincibility.

**How to apply:** Leave existing pursuit, reaction timing, momentum and tackling intact. Compare complete defensive states during matching outward motion, and separately change hidden move metadata while keeping observable position/velocity equal. Neither must alter defensive decisions.

CPU evasion must remain recognizable in ordinary complete plays, not merely activate in carefully arranged fixtures. Do not let tentative lane steering suppress every deliberate escape. A burst can yield to a newly approaching tackle threat, never restart another burst. Do not stack an extra CPU-only delay on top of the shared move cooldown.

**Why:** The user repeatedly reported invisible moves even after isolated displacement tests passed. Ordinary steering and stacked activation restrictions suppressed committed CPU moves; an initial overlap with a blocked defender could also pin an active move at its starting coordinates.

**How to apply:** Include complete seeded offensive plays, catches and returns in verification, count actual activations, and visually replay natural encounters at phone size. Collision sweeps must allow outward separation from an existing blocking overlap while retaining inward collision, new-body sweeps and actual-position tackle resolution. Surviving a play is not proof of moving: also check visible displacement while the play is live.

Quarterback pass taps, pass holds and deliberate one-second scramble activation own their entire gesture. That gesture's release must never become an evade. A fresh running ACTION becomes eligible after the quarterback commits beyond the line of scrimmage; it must never permit an illegal forward pass.

Kicking meters retain their own ACTION commands. A runner-only eligibility restriction must not suppress a valid field-goal timing press.

**Why:** The user explicitly protected passing, scrambling and kicking while requesting running actions for committed ball carriers.

**How to apply:** Treat held-gesture ownership separately from the latest player phase, and route existing contextual commands before restricting running actions. Exclude running moves during handoffs, catches in progress, kick meters, flight, selection and dead-ball states; do not queue a disabled action for a later phase.

The running ACTION change does not authorize manual defender selection or movement. Preserve CPU-controlled defense and its original immediate nearest-eligible tackle, sack, interception or breakup ACTION.

**Why:** The user expressly required the original defensive system to remain intact.

**How to apply:** Keep running and defensive action routing separate, and preserve autonomous CPU moves and pressure checks.
