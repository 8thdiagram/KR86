---
name: Running ACTION boundaries
description: User-requested intelligent ball-carrier actions without changing passing, CPU defense or approved presentation.
---

Eligible human running ball carriers use ACTION immediately on press, not on release. The game chooses spin left, spin right or a short boost from the nearest actual threat's position and approach, other players and legal sideline space. Holding ACTION must still halt forward progress, with legs running in place and up/down steering available; releasing resumes forward running without another evade. A committed quick lateral spin must finish before hold-to-halt takes over, rather than being canceled mid-lane. This applies across Classic, kick returns, catches and turnover returns.

**Why:** The user specifically requested intelligent running actions, then explicitly clarified that hold-to-halt must remain. They subsequently rejected apparent stationary spins and required a complete 0.20–0.30-second physical lateral juke; the hold threshold must not truncate it.

**How to apply:** Keep spins physical and progressive, approximately 1.25–1.5 rendered collision-body widths in authoritative world coordinates over 0.25–0.35 seconds, preserving forward momentum and the new lane afterward, with an authored full turn and tucked ball. The juke begins immediately and is perpendicular to the approach direction, including diagonal running and opposite-field returns, not always along the field's up/down axis. Verify actual tackle avoidance against a straight-run counterfactual, not just displacement or rotation, and account for ordinary travel during the move. CPU ball carriers should share the same physics and cooldowns but choose escapes only when forecast clearance improves. Verify sustained touchscreen presses as well as quick taps through the real gameplay engine. Keep open-field boosts temporary, about 20–25% for 0.35–0.45 seconds, with a short cooldown and natural cadence. Never add tackle immunity, teleport through bodies, enlarge collision boxes or change baseline ratings as a shortcut.

CPU evasion must remain recognizable in ordinary complete plays, not merely activate in carefully arranged fixtures. Evaluate deliberate escapes before tentative normal lane steering; an open-field burst must be able to yield to a newly approaching tackle threat. Do not stack an extra CPU-only delay on top of the shared move cooldown.

**Why:** The user repeatedly reported invisible moves even after isolated displacement tests passed. Ordinary steering and stacked activation restrictions suppressed committed CPU moves; an initial overlap with a blocked defender could also pin an active move at its starting coordinates.

**How to apply:** Include complete seeded offensive plays, catches and returns in verification, count actual activations, and visually replay natural encounters at phone size. Collision sweeps must allow outward separation from an existing blocking overlap while retaining inward collision, new-body sweeps and actual-position tackle resolution. Surviving a play is not proof of moving: also check visible displacement while the play is live.

Quarterback pass taps, pass holds and deliberate one-second scramble activation own their entire gesture. That gesture's release must never become an evade. A fresh running ACTION becomes eligible after the quarterback commits beyond the line of scrimmage; it must never permit an illegal forward pass.

Kicking meters retain their own ACTION commands. A runner-only eligibility restriction must not suppress a valid field-goal timing press.

**Why:** The user explicitly protected passing, scrambling and kicking while requesting running actions for committed ball carriers.

**How to apply:** Treat held-gesture ownership separately from the latest player phase, and route existing contextual commands before restricting running actions. Exclude running moves during handoffs, catches in progress, kick meters, flight, selection and dead-ball states; do not queue a disabled action for a later phase.

The running ACTION change does not authorize manual defender selection or movement. Preserve CPU-controlled defense and its original immediate nearest-eligible tackle, sack, interception or breakup ACTION.

**Why:** The user expressly required the original defensive system to remain intact.

**How to apply:** Keep running and defensive action routing separate, and preserve autonomous CPU moves and pressure checks.
