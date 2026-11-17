---
name: CPU defensive strategy parity
description: Why CPU positioning uses imperfect situational decisions rather than optimal defensive outcomes.
---

CPU defensive strategy should have the human's defensive tools, not perfect decisions or additional physical abilities. The requested situational percentages describe choosing retreat, never the probability of stopping a play.

**Why:** The user explicitly wants believable, weighted, unpredictable strategy in an explosive arcade game. Mistakes, missed tackles and long touchdowns are intended possibilities; greater defensive intelligence is not permission to normalize outcomes toward professional football.

**How to apply:** Change the decision policy, not offensive execution, ratings, blocking, pursuit speed or collision rules. Keep existing defensive calls meaningful and compare paired actual gameplay, including counterplays and already-earned breakaway states.

Activation latency is part of human/CPU parity, not just movement coefficients and tackle range.

**Why:** Immediate CPU positioning produced excessive saves in conditioned breakaways even though aggregate from-snap touchdowns barely changed. Respecting the human hold-admission floor removed that hidden timing advantage. Aggregate scoring alone can conceal this issue.

**How to apply:** Preserve admission delay and imperfect releases when iterating on the policy. Inspect actual contact, saved touchdowns and newly conceded touchdowns separately; do not tune to a predetermined scoring percentage.

An unchanged threat should retain a rejected or released decision. Strategic randomness must not consume the ordinary gameplay contest stream.

**Why:** The user specifically rejected repeated frame-by-frame chances and unintended changes to unrelated seeded gameplay.

**How to apply:** Use bounded opportunities within a play/possession context and an independently forked seeded stream. Verify rejected/nonactivated scenarios against a frozen baseline, not only statistical distributions.
