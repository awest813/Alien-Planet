# Plan: an XL map

An XL map is 256×256: 65,536 tiles, four times a Medium map and 1.8 times a Large one. It would land seven
colonists with room for eighteen. It isn't offered yet. This plan covers what has to change first, measured
against the sizes there are now:

| Size   | Tiles per side | Lands | Room for |
| ------ | -------------- | ----- | -------- |
| Tiny   | 64             | 3     | 6        |
| Small  | 96             | 4     | 9        |
| Medium | 128            | 5     | 12       |
| Large  | 192            | 6     | 15       |
| XL     | 256 (planned)  | 7     | 18       |

## Where it stands

These numbers come from a 256×256 colony started with today's code (`node perf.mjs size=256`, and a headless
browser at 1280×800).

- **Simulation:** about 58 ms per 1,000 ticks at day 8, with 7 colonists and 116 wild animals. The budget is
  60 ms. Large measures about 40 ms and Medium about 39 ms. A busy colony later on runs about twice its day-8
  figure, and an XL colony would have more than twice the people, so XL needs real headroom first.
- **Where the time goes on 256:**
  - animal updates, about 19% (wildlife scales with area, so there are 116 animals against 35 on Medium);
  - pathfinding, about 14% (longer walks mean longer searches);
  - the rest is spread out: colonists choosing work, combat, and the remaining whole-map scans.
- **Generation:** 170 ms (Medium 80 ms, Large 100 ms). That's fine.
- **Saving:** about 330 ms to serialize and write to IndexedDB at day 8. That's a visible hitch at each
  autosave.
- **Drawing:** about 1.3 ms a frame at the usual zoom and about 10.5 ms with the whole map on screen (Large
  takes 7.8 ms, Medium 4.3 ms). On a slow phone that whole-map view would be about four times that.
- **Gameplay:** Large already showed what distance does. Hunters chasing game across the map were mauled or
  downed far from help, and froze (11 of 89 colonists died in one six-seed run). Hunters now stay within 48
  tiles of home, and Large keeps 90 of 90 alive. On XL, raids, traders and wanderers walk about 128 tiles from
  the edge (about three in-game hours), and every haul from the edge of the claimed land is long.

## Work before XL is offered

### 1. Simulation speed (needed)

- **Far-off wildlife takes turns (done).** An animal more than 40 tiles (either way) from every colonist at home,
  and not tame, being tamed, marked for hunting, chasing, chased, angry, maddened or leaving, dozes
  (`Animal.dozing`, saved with the game). It is looked at only on its own turn, every fourth tick, and then
  moves four ticks' worth. Anything that comes after it wakes it at once. While dozing it also grazes four
  times longer between wanders, because finding its way about was most of its cost. The rule depends only
  on the game, so a seed plays the same every time.
- **Wildlife caps grow more slowly than area (done).** `wildScale` grows with the area up to Large (Tiny to
  Large are unchanged) and with the side past it, so XL holds 12× Tiny's wildlife (168 animals at most, 96 at
  landing) where area scaling would give 16× (224 and 128).
- **Measured after both** (eight seeds, 20,000 ticks from day 3, the same machine): XL went from 42.5 to
  37.1 ms per 1,000 ticks. Animal pathfinding calls fell by about 40%. Large and Medium didn't change beyond
  noise. The day-8 gate (45 ms) passes on this machine. The numbers above came from a slower one and should be
  measured again there. The 30-day balance run (`bal 30 6`) still loses no colonists on Large or XL. XL
  colonists go hungry a little more (489 starving colonist-hours against 404), which is for step 5 to check.
- A lesson for later speed work: an extra check made on every animal every tick cost more than skipping three
  ticks in four saved. Animals come in many object shapes, so each field read is slow. The far-off check runs
  only on an animal's turn, and the rest of its update is its own function (`actAnimal`).
- **Long paths.** Add a chunk-level route (16×16 chunks, linked where their edges are passable, rebuilt with
  `structureVersion`), then let A\* search inside the chunks along that route. This only matters for paths
  over about 48 tiles: arrivals from the edge, expeditions and long hauls.
- **The remaining whole-map scans:**
  - searches for the map's edge: use a cached list of edge tiles in place of `nearest()` growing outward from
    the colony to the border;
  - `nearest()` with a bias;
  - the storyteller's crop checks, the raid planner's feature scans, and `homeTile()`.

  Large-map work has already moved the goal checks and alerts onto the list of built tiles.

- **Gate:** `scripts/perf.ts size=256` under 45 ms at day 8, and a busy XL colony at day 40 under 100 ms.

### 2. Saving (needed)

- Autosave in parts across frames: serialize the arrays in one frame and write in the next. Or skip
  unchanged layers (terrain changes rarely: give it a counter bumped by every `setTerrain`, ice included, rather than
  `waterVersion`, which deliberately ignores freezing and thawing).
- **Gate:** no autosave frame over 100 ms on a desktop at day 40 on XL.

### 3. Drawing zoomed out (needed for phones)

- Below the marker zoom, draw the feature layer from a cached render texture per 32×32 chunk. Redraw a chunk
  only when one of its tiles changes, rather than drawing every tree's tile every frame.
- Offer an "overview" zoom floor on phones: whole-map zoom draws the minimap-style colour per tile, not the
  tile art.
- **Gate:** whole-map view under 8 ms a frame on a desktop, and under 33 ms on a phone with 4× throttling.

### 4. Play on a big map (needed)

- **Getting around:** clicking a colonist in the bar already jumps to them; add map bookmarks (number keys to save
  and recall a camera spot) and a jump to the latest alert.
- **Distance:** wood and brick floors already make walking faster (0.85 and 0.8 of grass's cost). Add a "road" designation, a cheap packed-earth path, so
  long routes are worth laying out. Add a second stockpile zone hint when items lie more than 40 tiles from
  storage.
- **Arrivals:** the storyteller's warnings ("raiders are coming") should give the same time to prepare on
  XL as on Medium. Spawn edge parties nearer the side the colony is on, or warn earlier in proportion to the
  walk.
- **Outposts (later):** a second, small base with its own stockpile and beds, far from the first, is the
  natural use of an XL map. That's a feature of its own and not needed for a first XL.

### 5. Balance and testing (needed)

- Run the balance harness on XL (`node bal.mjs 48 6 size=256`): no colonies wiped, deaths and breaks per
  colonist no worse than Large. Starvation per colonist runs about 1.5× Medium on Large today, so check fields
  and food with 18 colonists.
- Add XL to the playtests' rotation of sizes only once it's offered (the rotation reads `MAP_SIZES`).
- Run a ten-year game on XL (`years.mjs 240 2 size=256`) for save size, speed and population trends.
- Repeat the browser frame checks in this plan, on a desktop and on a throttled phone.

## Order

1. ~~Wildlife turns and caps, then measure again.~~ Done (see above). Pathfinding is still to be measured
   against the 15% in step 6.
2. Edge-tile list and the remaining scans.
3. Autosave in parts.
4. Chunked feature drawing zoomed out.
5. Arrival timing, bookmarks, roads.
6. Long-path chunk routes if the step 1 measurements still show pathfinding over 15%.
7. Balance and the ten-year run, then add `{ size: 256, label: 'XL', colonists: 7, maxColonists: 18 }` to
   `MAP_SIZES`.
