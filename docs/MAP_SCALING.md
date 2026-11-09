# Plan: gameplay that fits the map's size

The four map sizes differ in more than room. Anything that walks in from the edge takes about 15 times
longer to arrive on Large than on Tiny, and everything placed by area (wildlife, wild plants, ore) grows with
the map while the colony grows more slowly. This plan lists what should stay the same whatever the size, what
should differ on purpose, and the changes that get there.

## Measured

These come from the balance harness (`node bal.mjs 48 6 size=N`: 48 days, six seeds, Standard) and a
walking-time script (four seeds per size, timed from the event to first contact).

| Size       | Raiders reach the colony | Traders arrive | Starving hours per colonist | Raids per colonist |
| ---------- | ------------------------ | -------------- | --------------------------- | ------------------ |
| Tiny 64    | 0.1–0.3 h                | 0.4–1.3 h      | 35                          | 0.86               |
| Small 96   | 0.3–0.9 h                | 0.8–1.3 h      | 16                          | 0.45               |
| Medium 128 | 1.1–4.2 h                | 1.5–1.8 h      | 12                          | 0.48               |
| Large 192  | 1.8–3.5 h                | 2.7–3.5 h      | 18                          | 0.32               |
| (XL 256)   | 3.6–4.5 h                | 3.5–4.3 h      | —                           | —                  |

What stands out:

- **On Tiny, a raid is on the colony before anyone can react.** The message says "Draft your colonists", and
  the raiders are there within 6–18 in-game minutes, under ten seconds at normal speed. Thieves slip in and
  out just as fast. On Large the same raid gives hours of warning.
- **Allies come at the wrong time on both ends.** They set off 1–3 hours after the raid appears, then walk
  in from the edge. On Tiny they arrive after the fight. On Large they arrive 4–6 hours in, often after the
  raiders have broken.
- **Traders spend part of their stay walking.** Their 30 hours count from when they appear at the edge, so a
  Large map loses about 3 hours of trading (10%).
- **Tiny colonies go hungry most.** Six colonists on 4,096 tiles share the smallest wildlife cap (14
  animals) and the fewest wild bushes. Large colonies go hungry more than Medium ones because of the walking.

## Stays the same at every size

- How long you have between "raiders are coming" and the first shot. Aim for about 1.5 hours or more.
- How long a trader or envoy stays once they're at the colony.
- That a friendly faction's fighters, once called, arrive in time to matter.
- Raids per colonist and food per colonist, roughly. The map's size is a choice of scale, not of
  difficulty.

## Differs on purpose

- **Room and population:** 6 / 9 / 12 / 15 colonists.
- **Distance:** a big map means long walks, more wild land and more to find. That's the appeal of a big map,
  and the price is hauling and travel.
- **Warning time on big maps** can run past the 1.5-hour floor, since raiders really are farther away. The
  message should say how far off they are, so drafting early isn't wasted.

## Changes

All done except 5, which the evidence didn't support.

1. **Raiders muster at the edge on small maps (done).** When a raid, thieves or a maddened pack arrives, the
   walk is estimated (straight-line distance over their speed, plus a fifth for rough ground). If it's under
   1.5 hours, they hold at the edge for the difference (`musterUntil` on the raid, or on each animal of a
   pack; older saves have none). They come on at once if a colonist, or an ally, comes within 12 tiles, or if
   one of them is hurt. A siege party keeps its own camp timing.
2. **The warning says when (done).** "Raid! 5 raiders from X are coming from the north, and will reach the
   colony in about 2 hours." Packs and thieves say the same. While they're on the way, the side panel's raid
   alert reads "gathering at the edge" or "on their way", and when to expect them.
3. **Allies arrive with the raid (done).** They set off so as to arrive when the raiders are expected (for a
   siege, at the attack), less their own walk in from the nearest edge, plus 0–1 hours. Hired fighters are
   on time.
4. **Traders stay their full 30 hours at the colony (done).** The stay counts from arrival, with a cap of 36
   hours from their first appearance for a party that never gets there. Envoys wait days for an answer, so
   the walk doesn't matter for them; they're unchanged.
5. **More food on Tiny (dropped).** Two of the six Tiny seeds account for 85% of the hunger. The median Tiny
   colony goes hungry about 14 hours per colonist, the same as the other sizes. Changing Tiny's generation
   would also have shifted every seed-based test. Not worth it.
6. **Big maps: a stockpile nearer the work (done).** An alert when 60 or more loose items lie over 40 tiles
   from any storage. It counts storage in 16×16 blocks so it stays cheap, and clicking it goes to the
   biggest pile. It never fires on Tiny or Small.

## Results

- First contact, after the change: Tiny 1.3–1.7 hours (one seed 0.4, where a colonist was working near that
  edge and so met them early), Small 1.2–1.6, Medium 1.2–4.2, Large 1.8–3.5, the last two unchanged.
- Balance, 48 days, six seeds: no colony lost anyone but to old age.

  | Size   | Survivors | Breaks | Starving hours  |
  | ------ | --------- | ------ | --------------- |
  | Tiny   | 36/37     | 6      | 897 (from 1308) |
  | Small  | 54/54     | 2      | 573             |
  | Medium | 73/74     | 2      | 846             |
  | Large  | 90/90     | 10     | 1861            |

## Not in this pass

- Wildlife caps that grow more slowly than area, and far-off animals updating less often. These are in the
  XL plan (docs/XL_MAP.md) as speed work; within hunting range, wildlife density is the same at every size.
- Outposts and roads (XL plan).
