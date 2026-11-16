---
name: Running ACTION boundaries
description: User-requested intelligent ball-carrier actions without changing passing, CPU defense or approved presentation.
---

Eligible human running ball carriers use ACTION immediately on press, not on release. The game chooses spin left, spin right or a short boost from the nearest actual threat's position and approach, other players and legal sideline space. Holding ACTION must still halt forward progress, with legs running in place and up/down steering available; releasing resumes forward running without another evade. This applies across Classic, kick returns, catches and turnover returns.

**Why:** The user specifically requested intelligent running actions, then explicitly clarified that the original hold-to-halt behavior must remain, including moving legs and lateral steering.

**How to apply:** Keep spins physical and progressive, approximately one rendered body width in world coordinates, with an authored full turn and tucked ball. Keep boosts temporary, about 15–20% for 0.35–0.5 seconds, with a short cooldown and natural cadence. Never add tackle immunity, teleport through bodies, enlarge collision boxes or change baseline ratings as a shortcut.

A sustained running ACTION must not truncate an already-started spin's lateral travel. Holding still halts forward motion and permits lateral steering; a clear, neutrally steered spin completes its body-width displacement and then remains halted until release.

**Why:** The user reported rotation without a useful lane change and explicitly requested a completed physical spin while preserving the current controls.

**How to apply:** Test holds that cross the hesitation threshold, not only quick taps; verify actual world coordinates and the persistent lane after release, including collision correction after rating multipliers.

Quarterback pass taps, pass holds and deliberate one-second scramble activation own their entire gesture. That gesture's release must never become an evade. A fresh running ACTION becomes eligible after the quarterback commits beyond the line of scrimmage; it must never permit an illegal forward pass.

Kicking meters retain their own ACTION commands. A runner-only eligibility restriction must not suppress a valid field-goal timing press.

**Why:** The user explicitly protected passing, scrambling and kicking while requesting running actions for committed ball carriers.

**How to apply:** Treat held-gesture ownership separately from the latest player phase, and route existing contextual commands before restricting running actions. Exclude running moves during handoffs, catches in progress, kick meters, flight, selection and dead-ball states; do not queue a disabled action for a later phase.

The running ACTION change does not authorize manual defender selection or movement. Preserve CPU-controlled defense and its original immediate nearest-eligible tackle, sack, interception or breakup ACTION.

**Why:** The user expressly required the original defensive system to remain intact.

**How to apply:** Keep running and defensive action routing separate, and preserve autonomous CPU moves and pressure checks.
