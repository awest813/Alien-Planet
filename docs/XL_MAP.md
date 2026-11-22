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

## Where it stands now

Steps 1 to 7 below are done or settled. What's left before XL is offered is balance and the long run (step 8),
and a raid day that still runs past the gate now and then (see Raid days).

Against the gates: day 8 at 37 ms per 1,000 ticks (gate 45); a busy XL colony at day 40 at 73–85 ms (gate 100;
it was 110–189); the worst autosave frame 25 ms on a desktop and 56 ms on a throttled phone (gate 100); the whole
map drawn in 3.3 ms on a desktop and 12.4 ms on a throttled phone (gates 8 and 33).

## Where it stood

These numbers come from a 256×256 colony started with the code as it was when this plan was written
(`node perf.mjs size=256`, and a headless browser at 1280×800). The sections below say what changed.

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

### 1. Simulation speed (done)

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
  colonists go hungry a little more (489 starving colonist-hours against 404), which is for the balance step to
  check.
- A lesson for later speed work: an extra check made on every animal every tick cost more than skipping three
  ticks in four saved. Animals come in many object shapes, so each field read is slow. The far-off check runs
  only on an animal's turn, and the rest of its update is its own function (`actAnimal`). A woken animal rests
  no longer than an awake one would: its dozer's long graze had kept it standing about with people close by.
- **Long paths (measured; a narrower change instead of chunk routes).** Every search on XL, logged by who
  asked for it:
  - Quiet colony: pathfinding was 13% of the time, and searches over 48 tiles were 84 of its 160 ms. These were
    a colonist going 100 to 190 tiles to eat, feed a patient or tend one, at 2 to 5 ms each.
  - A raid of 12 on a young colony: 27%, long searches 90 of 107 ms.
  - The cost came from the search's estimate, scaled down to 0.8 a step for the cheapest floor, which makes A\*
    look over a wide band either side of a long walk. It didn't come from routing round obstacles, so 16×16 chunk
    routes would cut little.
  - **Instead, a walk over 48 tiles with no floor in the open within 16 tiles of it is searched with the
    estimate a step of open ground gives** (1, `LONG_WALK` in pathfinding.ts). That's about 45% off each such
    search, and on 50 such walks measured none came out longer (a test holds it within 2%).
  - A road or any floor laid in the open near the walk keeps the careful search. A floor in an enclosed room
    doesn't count: a room is roofed whether or not the roof layer says so. Without that, a 90-tile walk
    ignored a road two tiles off its line (a test now holds it). Floors are counted per 16×16 block, recounted
    when a floor or roof changes.
  - Measured after: the young colony's raid went from 83 to about 60 ms per 1,000 ticks, but that game
    diverged (the raid ended sooner). The busy 45-day XL colony averaged 92 against 100. From two raids saved
    from busy colonies (day 26, day 40), the difference is lost in noise.
  - On those raid days the time goes to the raiders' choices (22%), allies (8%), colonists' fighting (9%) and
    the animals (17%). Pathfinding there is about 15%, most of it raiders' short searches. That's where raid
    days are to be won, not in long paths.
  - The animals' far-off check now loops over a flat list of where everyone stands. Taking each pair apart in a
    callback had been the animal loop's busiest line in a raid.
- **The remaining whole-map scans (done).** A busy XL colony (the balance autoplayer:
  `PERF=1 bal 45 3 size=256`) showed where whole-map work still cost something. The scans this plan first named had mostly
  gone already: searches for the edge use `nearestEdge` (the animals' four did too now), the storyteller's
  crop checks use the built tiles, and `homeTile()` was 1%. What did cost was rescanning after a tree was
  felled or a fire ran low:
  - room contents, 1,900 times in 35 days at 0.44 ms each (5%): now measured from the tiles of enclosed
    rooms and, outdoors, from what's built there. Trees, rocks and floors outdoors add only beauty, and beauty
    counts only in an enclosed room;
  - the lists of fires, generators, lamps and fishing spots (3%): now rebuilt from the built tiles, only when
    a building comes or goes;
  - the colony's centre (`homeTile()`): from the built tiles;
  - a raider choosing which wall to break: from the tiles with features, not the whole map.

  Each keeps the tile order or breaks ties to the lower tile, so the answers are the same to the last bit.
  The balance harness gives identical output before and after, and `searches.test.ts` compares each with a
  scan of the whole map. A busy XL colony went from 97–104 to 79–89 ms per 1,000 ticks over 45 days.

- **What was left after these, by the same profile:** colonists choosing work (`findJob`, 15%), animals (25%,
  mostly pathfinding and the per-animal loop itself), pathfinding as a whole (13%), and raids: a raid day still
  ran 130–190 ms. Raid days and the animals were taken up in step 7 (see Raid days).
- **Gate:** `scripts/perf.ts size=256` under 45 ms at day 8, and a busy XL colony at day 40 under 100 ms. Both
  pass: 37 ms, and 73–85 ms on three seeds since step 7.

### Raid days (step 7, done but for the worst)

Measured from two raids saved from busy XL colonies (`SAVE_RAID=day:file` in the balance harness, then
`perf.ts from=file`, best of three), and from the 45-day balance run (`PERF=1 bal 45 3 size=256`):

- **Animals marked for the hunt now doze far off like the rest.** A hunter is a colonist, and wakes one
  coming within reach; till then it covers the ground at the same pace. Kept awake when marked, no animal
  dozed in a colony that marks all its game (the balance autoplayer's): now 97% do. This was most of it.
- **Every colonist looked through every animal for an angry one each tick.** The angry ones are listed once a
  tick, and the list starts over whenever one is angered (`angered` in animals.ts). The answers are the same:
  the balance output was identical.
- **Allies coming from the map's edge worked out their whole way again** each time the raider they were after
  moved (searches of over 100 tiles every 30 ticks). They keep their course while the raider is within a
  quarter of the walk left of its end, which shrinks to nothing as they close.
- **Cover** is worked out without making three lists for every shot and look round (identical output).
- **The built tiles** are kept by the world as it goes (`tilesWith('built')`), and `buildingTiles` gives them
  in tile order, as a loaded game has them. They had been picked out of every tree on the map each time a
  crop was sown or reaped, or a raider broke something. The beacon is looked for among them, only when a
  building changes.

Result, 45 days on three seeds, 45 of 45 alive either way:

|                         | Before     | After      |
| ----------------------- | ---------- | ---------- |
| All days                | 100–115 ms | 64–77 ms   |
| Raid hours              | 154–168 ms | 100–122 ms |
| Day 40                  | 110–189 ms | 73–85 ms   |
| Worst raid day          | 212–275 ms | 154–223 ms |
| Starving colonist-hours | 360        | 220        |

Large over 40 days on six seeds is unchanged in effect: 91 of 91 alive, hunger 291 colonist-hours against 270.
**The worst raid days** (a big raid with allies and a siege) still run 150–220 ms for an in-game day: at the
fastest speed, a slow machine would drop frames through it. That's worth a look before or with balance.

### 2. Saving (done)

- **Measured first**, on a busy XL colony at day 40 (from the balance harness) in the real game in headless
  Chromium, with drawing paused so the save alone shows. A whole autosave took 24–33 ms on a desktop, with no
  long task, so the desktop gate already passed. The 330 ms above was from when listing the slots read every
  save in full. Each save's summary is kept apart now. On a phone-speed CPU (Chromium's 4× throttle), though,
  one task ran 68–116 ms and the worst frame was 122 ms, when another colony's autosave was moved aside first.
  Almost all of that was the browser storing the map's layers: 3.6 MB on XL, nearly all zeroes.
- **Mostly empty layers are saved as the tiles that aren't** (`packLayer`, save version 17). Each layer is
  kept whole unless pairs of tile and value come to less than half its bytes. Every value comes back to the
  bit, floats included, through the browser's storage. JSON can't tell -0 from 0, whole layers or packed.
  Version 16 saves still load. A game from before refuses a 17 as "a newer version" rather than reading it as a
  blank map. Packing the twenty layers takes about 2.5 ms on a desktop, and the write fell from about 13 ms to
  4 ms.
- **The write has a frame of its own:** the colony is copied in one frame and handed to storage after the next
  frame is drawn. A hidden page gets no frames, so a page being left writes at once, and a save already waiting
  when the page is hidden goes then too. A copy older than one already written to that slot isn't written
  (a save begun as the window lost focus had waited until the player came back, then wrote over what another
  tab had saved meanwhile; an audit found it, and a browser test holds it). Nor is an autosave another tab has
  taken over while it waited.
- **Result** (the same colony and measurement): on a desktop, the worst frame is 25 ms and there's no long task.
  At 4× throttle the worst frame is 56 ms (from 122). The one long task left (58–68 ms) is the first save,
  before the browser has optimized the code. The other skipped option, leaving unchanged layers out, isn't
  needed.
- **Gate:** no autosave frame over 100 ms on a desktop at day 40 on XL. It passes, and passes on a throttled
  phone too.

### 3. Drawing zoomed out (done)

- **Measured first**, on the busy day-40 XL colony in headless Chromium at 1280×800, paused, timing the game's
  step from `prestep` to `postrender`. Zoomed out, the features were already drawn by a GPU layer
  (`featureFar`, brought up to date at most once a second), which does the job the per-chunk textures were
  planned for. At the usual zoom a frame took 6.3 ms on a desktop and 25 ms at 4× throttle. With the whole map
  in view it took 5.6 ms and 28 ms (31 ms for the slowest tenth).
- **What cost the time** was shapes Phaser draws afresh every frame:
  - The water's shores and glints were 55,000 rectangles with the whole XL map in view. Below the marker zoom
    a shore's line and a glint are under a pixel across, so they're no longer drawn there.
  - Phaser draws a container wherever it is, so the hundred-odd animals off screen were drawn every frame.
    Animals and colonists more than two tiles out of view are hidden.
  - Each animal marked for hunting drew its crosshair as 53 shape commands. The crosshair, the taming ring and
    the collar are now small pixel-art images, drawn in one batch with everything else.
- **Result:** at the usual zoom, 2.0 ms on a desktop and 9–10 ms at 4×. With the whole map, 3.3 ms and 12.4 ms
  (20 ms for the slowest tenth).
- **Gate:** whole-map view under 8 ms a frame on a desktop, and under 33 ms on a phone with 4× throttling. Both
  pass. The planned overview zoom for phones isn't needed for this gate, so it's left out.

### 4. Play on a big map (done, but for outposts)

- **Getting around (done):** besides clicking a colonist in the bar, **Shift+4 to 9** bookmarks the middle of
  the view on that number and **4 to 9** goes back there (1 to 3 stay the game's speeds). The bookmarks are saved
  with the colony; a save from before has none. **I** goes to the latest thing that happened somewhere: the
  newest entry in the story about a place or someone who can still be found, its card gone or not, or else the
  first alert that points at something. Both are in the controls list and the help.
- **Distance (done):** a **Road** (Floors) is packed earth, laid for the work alone (20, half a wood floor's)
  with no materials, and walked on at 0.85 of grass's cost (sand is 1.3), the same as a wood floor. Long walks
  bend to keep to one. It's the last feature in the list, so the saves' feature numbers don't move. The alert
  for loose items far from storage was done in the map-scaling pass (docs/MAP_SCALING.md, change 6).
- **Arrivals (measured, left as they are):** raiders already come from the edge nearest the colony, and the
  warning says when they'll arrive. Five seeds, a raid three days in:

  | Size   | Said                   | First contact with a colonist |
  | ------ | ---------------------- | ----------------------------- |
  | Medium | an hour and a half–2.5 | 1.7–2.1 h (one at once)       |
  | Large  | an hour and a half–4   | 1.3–2.4 h                     |
  | XL     | 4 hours                | 0.9–3.8 h                     |

  On XL the colony gets more time to prepare than on Medium, never less. The early contacts are colonists out
  working towards that edge. The map-scaling plan settled that a big map's longer warning is fine as long as
  the message says when, so the timing isn't evened out.

- **Outposts (later):** a second, small base with its own stockpile and beds, far from the first, is the
  natural use of an XL map. That's a feature of its own and not needed for a first XL.

### 5. Balance and testing (needed: step 8)

- **First run, after step 7** (`bal 48 6`, standard; XL plays with Large's population of 6 landing and room for
  15 until XL has its own entry):

  | Size  | Survivors | Breaks | Starving colonist-hours | Of those, on the way to eat |
  | ----- | --------- | ------ | ----------------------- | --------------------------- |
  | Large | 91/91     | 0      | 394                     | 243                         |
  | XL    | 90/90     | 1      | 700                     | 392                         |

  No colony lost anyone, and breaks are no worse to speak of. **Hunger is nearly twice Large's**, and it comes from
  the fighting, not from work spread over the map. In every starving hour there were meals and raw food in store.
  Where those hours went (`STARVE`-style tally: what the colonist was doing, drafted or not, how far from home):

  | Starving colonist-hours                   | Large | XL   |
  | ----------------------------------------- | ----- | ---- |
  | Eating, within 16 tiles of home           | 127   | 147  |
  | Eating, 16–47 tiles out                   | 80    | 134  |
  | Eating, 48 or more tiles out              | 34    | 98   |
  | Drafted (a raid on, or held after a pack) | 98    | 167  |
  | Downed                                    | ~50   | ~130 |

  Raids on XL drag on across more ground. The balance harness keeps every fit colonist drafted while any raider
  still fights, and moves them up to the raiders. Drafted colonists don't eat (it's the player's call), so they
  go hungry, often far from the stores, and starve on the walk back once stood down.
  - Tried and dropped: counting the walk home in when to eat at work (worse: 9 dead, 13 breaks, 814 hours), and
    XL's wildlife back on area scaling (worse: 3 dead, 6 breaks, 848). The side-scaled cap stays.
  - **Done: a drafted colonist who is starving (food under 0.05), with no raider still fighting or angry animal
    within 20 tiles, goes for the nearest food, then back to where they stood, still drafted** (`draftedMeal`).
    A threat coming near calls the meal off, and so does an order; nobody sets off for food while walking
    somewhere they were sent. Their status reads "Drafted: getting something to eat".

  After it, `bal 48 6`, starving colonist-hours: Medium 215 to 207 (73 of 73 alive), Large 394 to 279 (92 of 92),
  XL 700 to 353 (90 of 91, one of old age). XL now goes hungry less than Large did before, with one break on each.

- **XL with its own population** (7 landing, room for 18, in a test build; not offered yet), `bal 48 6`: 108 of
  109 alive (one of old age), 1 to 3 breaks, 446 to 471 starving colonist-hours (about 4 an hour a colonist,
  against Large's 3 to 4), and 80 to 98 ms per 1,000 ticks on average.
- **Raiders chasing a colonist on the move** keep their course as allies do (`CHASE_SLACK`): in the worst raid of
  that run (14 raiders and 5 allies), raiders working out walks of 60 tiles and more every 30 ticks were a third
  of the time. Replayed from a save, it went from 173–185 to 120–124 ms per 1,000 ticks. The balance came out the
  same within noise (Large 91 of 91, XL 108 of 109).
- **Raiders setting off together share the way:** in the worst raid of that run, a fifth of raiders' searches were
  the same search again, by several raiders on one tile in the same tick. The way is worked out once a tick for
  each tile and goal (the ground as it stands), and each gets a copy (balance output identical): searches fell
  from 312 to 247.
- **The ten-year game** (`years.mjs 240 2 size=256`, XL's own population, in a test build), two colonies:
  - population steady at 16 to 19, births (7 and 5) making up for deaths, all of old age; 20 of 26 and 20 of 22
    ever alive at the end;
  - food 7 to 63 days in store, mood 50 to 73, breaks 10 and 4 in ten years;
  - the save about 1.5 to 1.7 MB the whole way, not growing;
  - speed: 104 and 117 ms per 1,000 ticks over the ten years (with other runs sharing the machine, so on the
    high side), later years mostly 100 to 130, raid hours about 200, the worst single days 516 and 541.
- **The worst of those was a siege** (day 140, 22 raiders against 21 colonists). Raiders walking to their post
  worked out the whole way again every 60 ticks, though the post doesn't move, and every siege raider looked
  every colonist over each tick for a charge or a shot that mostly wasn't due. Fixed (the colonist checks give
  the same answers): 184–196 to 150–157 ms.
- **Later years' ordinary days:** a colony of 21 at day 143 ran 101–121 ms per 1,000 ticks, a third of it
  colonists choosing work, and the biggest part of that hauling. Each colonist looked over every stack in the
  stores again at every turn of their work, in a colony where nearly everything is put away. A look that finds
  nothing now waits 60 ticks before the next (`HAUL_RETRY`, saved with the other searches' timers): 90–96 ms,
  balance within noise. Tried and dropped: giving every animal object the same shape (no faster).
- **What's left:** big raids and sieges in later years still run about 150 ms per 1,000 ticks while they last.
  The plan's gates pass, ordinary days in later years included. A slow machine at the fastest speed would drag
  only through the big fights.

### 4. Play on a big map (done, but for outposts)

- **Getting around (done):** besides clicking a colonist in the bar, **Shift+4 to 9** bookmarks the middle of
  the view on that number and **4 to 9** goes back there (1 to 3 stay the game's speeds). The bookmarks are saved
  with the colony; a save from before has none. **I** goes to the latest thing that happened somewhere: the
  newest entry in the story about a place or someone who can still be found, its card gone or not, or else the
  first alert that points at something. Both are in the controls list and the help.
- **Distance (done):** a **Road** (Floors) is packed earth, laid for the work alone (20, half a wood floor's)
  with no materials, and walked on at 0.85 of grass's cost (sand is 1.3), the same as a wood floor. Long walks
  bend to keep to one. It's the last feature in the list, so the saves' feature numbers don't move. The alert
  for loose items far from storage was done in the map-scaling pass (docs/MAP_SCALING.md, change 6).
- **Arrivals (measured, left as they are):** raiders already come from the edge nearest the colony, and the
  warning says when they'll arrive. Five seeds, a raid three days in:

  | Size   | Said                   | First contact with a colonist |
  | ------ | ---------------------- | ----------------------------- |
  | Medium | an hour and a half–2.5 | 1.7–2.1 h (one at once)       |
  | Large  | an hour and a half–4   | 1.3–2.4 h                     |
  | XL     | 4 hours                | 0.9–3.8 h                     |

  On XL the colony gets more time to prepare than on Medium, never less. The early contacts are colonists out
  working towards that edge. The map-scaling plan settled that a big map's longer warning is fine as long as
  the message says when, so the timing isn't evened out.

- **Outposts (later):** a second, small base with its own stockpile and beds, far from the first, is the
  natural use of an XL map. That's a feature of its own and not needed for a first XL.

### 5. Balance and testing (needed: step 8)

- **First run, after step 7** (`bal 48 6`, standard; XL plays with Large's population of 6 landing and room for
  15 until XL has its own entry):

  | Size  | Survivors | Breaks | Starving colonist-hours | Of those, on the way to eat |
  | ----- | --------- | ------ | ----------------------- | --------------------------- |
  | Large | 91/91     | 0      | 394                     | 243                         |
  | XL    | 90/90     | 1      | 700                     | 392                         |

  No colony lost anyone, and breaks are no worse to speak of. **Hunger is nearly twice Large's, and most of it
  is colonists walking to their food.** Colonists on XL go 100 to 190 tiles to eat (see Long paths): the work
  spreads over the bigger map and the food stays at home. More game isn't the answer. With XL's wildlife back
  on area scaling (224 at most rather than 168), hunger rose to 848, three colonists died, and breaks went to 6.
  So the side-scaled cap stays. What's to try: eating before setting off for far work, and carrying a meal out
  to it, or a stockpile of food nearer the work.

- Run the balance harness on XL (`node bal.mjs 48 6 size=256`): no colonies wiped, deaths and breaks per
  colonist no worse than Large. Starvation per colonist runs about 1.5× Medium on Large today, so check fields
  and food with 18 colonists.
- Add XL to the playtests' rotation of sizes only once it's offered (the rotation reads `MAP_SIZES`).
- Run a ten-year game on XL (`years.mjs 240 2 size=256`) for save size, speed and population trends.
- Repeat the browser frame checks in this plan, on a desktop and on a throttled phone.

## Order

1. ~~Wildlife turns and caps, then measure again.~~ Done (see above).
2. ~~Edge-tile list and the remaining scans.~~ Done (see above). Raid days on a busy XL colony are still
   over the 100 ms gate.
3. ~~Autosave in parts.~~ Done (see Saving).
4. ~~Chunked feature drawing zoomed out.~~ Done another way (see Drawing zoomed out).
5. ~~Arrival timing, bookmarks, roads.~~ Done (see Play on a big map).
6. ~~Long-path chunk routes if the step 1 measurements still show pathfinding over 15%.~~ Measured: long
   searches made cheaper another way (see Long paths); chunk routes not needed.
7. ~~Raid days under the gate.~~ Done but for the worst raid days (see Raid days).
8. Balance and the ten-year run, then add `{ size: 256, label: 'XL', colonists: 7, maxColonists: 18 }` to
   `MAP_SIZES`.
