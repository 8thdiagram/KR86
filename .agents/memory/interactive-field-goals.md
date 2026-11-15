---
name: Interactive field goals
description: User's field-goal presentation, geometry, and preservation requirements.
---

Field goals must be aimed and kicked directly in Kick View, not overhead with a post-kick cinematic. The visible success zone must line up with the actual projected upright opening, narrowing with distance and reflecting the actual lateral dead-ball position. Ball flight and scoring must agree at the same goalpost plane; never steer the rendered ball separately based on a preselected result.

**Why:** The user explicitly requested an interactive, distance-aware kicker perspective rather than a decorative Kick View replay.

**How to apply:** Keep one ACTION to commit the existing meter after the ordinary snap. Preserve CPU timing probabilities, kicker strength/range and Franchise modifiers; do not add a power slider, wind model or hidden accuracy lottery that the game does not already have. Retain optional lateral kick-origin data across saves without moving unrelated scrimmage formations. Show the verdict only after crossing, and retain blocked-kick recovery gameplay. Use a sharp NES crowd in the two actual teams' colors.

Short attempts must look visibly close; long attempts should get harder through a narrower projected window and gradually faster human timing, without hidden randomness.

**Why:** The user reported that an attempt under 30 yards still looked far away and explicitly requested continuous distance-based difficulty.

**How to apply:** Calibrate from actual launch/post coordinates, never add snap and end-zone distance to the already announced distance. Keep the aiming track stable and left/right hashes aligned with the actual posts. A close camera must keep the full ball arc visible by moving the whole scene together, not changing only the drawn ball or the scoring outcome.

Fans must remain fixed relative to the field when the kick camera follows the ball; they must not appear attached to the camera.

**Why:** The user specifically corrected crowd behavior during airborne field goals.

**How to apply:** Keep the crowd and stadium anchored to the same world as the turf and posts. Camera follow must not change the seating layout or spectator count.
