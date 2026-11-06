# Colony Alpha roadmap: the next phases

A working plan for what comes after the current build. The direction so far: **art and decor, musical
instruments, recreation, and more**. Each phase lists what it adds, how it fits the systems the game already
has, what it needs first, and how we'll know it works. Section 7 records the decisions made so far.

## 1. Where the game stands

The simulation covers survival, farming, cooking, crafting, research (17 projects), power, seasons, weather
and fire, health and disease, raids and manhunters, trade, wildlife and husbandry, traits and relationships.
The in-game goals run through five phases: Shelter, Living, Story, Seasons, Prosperity.

What the next phases build on:

| System     | Today                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Recreation | One "joy" need. Two joy buildings (armchair: relaxing; horseshoe pin: pitching), or a walk.               |
| Beauty     | Furniture and floors have beauty. It only matters through a room's impressiveness (bedroom, dining room). |
| Rooms      | Roles: bedroom, barracks, kitchen, workshop, dining room, recreation room.                                |
| Skills     | Nine: mining, construction, plants, cooking, crafting, medicine, combat, intellectual, animals.           |
| Social     | Chats, deep talks and insults move opinions; friends, rivals, lovers.                                     |
| Story      | Storyteller events, story log, Story screen.                                                              |
| Sound      | None.                                                                                                     |
| Death      | The body leaves no trace; colonists get a mood thought.                                                   |

**Balance, from the latest harness runs** (`npx tsx scripts/balance.ts 48 12 start=6`, Standard, 48 days, 12
seeds): 72 of 74 colonists survive and no colony is wiped out. Food runs at 10–30 days of stores from day 10
on, and cooking starts around day 5. Wildlife holds at 6–10 animals through the first year. Harsh (30 days,
6 seeds) loses nobody.

## 2. Groundwork (done)

1. **A bigger tileset.** Done. The layout lives in `src/render/tileset-layout.ts` and sizes each section
   (terrain, buildings, plans, items, overlays, crops) from the definitions, so new content can't run out of
   room. The UI's item icons use the same layout instead of a copy of it. A test checks that no two pieces
   of art share a frame.
2. **Recreation kinds.** Done. Each joy building has an `activity` (what the colonist is shown doing) and a
   `kind`: relaxing, gaming, social, outdoor, music or art. The armchair is relaxing, horseshoes are gaming,
   and walks are outdoors. Each colonist keeps a tally of recent recreation by kind (`recentJoy`), which
   halves every dawn and is saved; the inspector shows it as "Recent recreation". Phase A's tolerance and
   variety rules read this tally.
3. **An Artistic skill.** Done. A tenth skill, trained by sculpting and playing music once those exist. The
   Art work type comes with the sculptor's table in Phase B, so the Work screen doesn't show a column
   with nothing to do.
4. **Harness metrics.** Done. The balance script now reports:
   - mood by thought (the average contribution of each);
   - the share of colonist-hours with recreation under 30%;
   - the average impressiveness of each room role at the end.

   **Baseline** (Standard, 30 days, 6 seeds):
   - Recreation is under 30% for about 20% of colonist-hours.
   - The biggest mood factors are cooked meals (+1.7), having a friend (+1.6) and shared bedrooms (−1.0).
   - Boredom costs −0.5 and "Entertained" gives +0.3.
   - The test colony builds only barracks and plain rooms.

Also from this work: an undrafted colonist caught outside with raiders near now runs for shelter before
trading shots, unless a raider is already beside them. The check used to run only every 20 ticks, so
whether they ran or stood and shot depended on timing.

## 3. Phase A: Recreation depth (done)

A colony with one armchair no longer has recreation solved for good: variety pays, and games bring people
together.

- **Tolerance.** Each kind of recreation is worth full value up to a fair share of what a colonist has had
  lately (half a need's worth). Past that, it's worth (1 + 0.5) / (1 + recent amount), down to 25%. The
  recent amount halves every dawn. Colonists choose whatever would do them the most good, allowing for the
  walk there, so they move between kinds on their own.
- **Variety thoughts.** "Varied recreation" (+3) when three kinds each make up a fair share of what they've
  had lately. "Same old thing for fun" (−2) when one kind is 85% or more of it, but only once the colony has
  built something for fun, so a fresh landing with nothing but walks isn't penalised.
- **New buildings:**
  - Chess table (wood and stone): games, two players.
  - Card table (wood and cloth): social, up to four players.
  - Telescope (Optics research, 700): stargazing on clear nights under the open sky, which leaves a
    "Gazed at the stars" thought.

  On the two tables:
  - Played alone, a game is worth 40%. A colonist sits down to wait when someone else is free for
    recreation too, and anyone free joins a game already going.
  - Players talk as they play, with fewer insults than talk in passing. A game of half an hour or more
    leaves a "Had a good game" thought.
  - Rivals won't sit at the same table.

- **Nature walks.** A walk among trees, bushes or water fills recreation up to half again as fast.
- **Recreation room.** A session in an impressive recreation room leaves "Had fun in a nice room" (+3).
- **Goals:** "Offer three kinds of recreation" and "Have two colonists play a game of chess" (Prosperity).
- **Results** (Standard, 48 days, 12 seeds, with the test colony now building a chess table, a card table
  and a telescope):
  - Recreation time spreads across horseshoes, cards, the armchair, walks and chess, where before almost
    all of it was horseshoes and walks.
  - Average mood is unchanged (48.1 against 48.2) and survival is the same (71 of 73).
  - Time with recreation under 30% went from 17% to about 20%: repetition is worth less now.
  - There were 5 mental breaks in 12 colonies, against 3 before. Most come from one colony stuck in a
    famine; the others had 2 between them.
  - Harsh: 72 of 73 survive with no breaks. Peaceful: 36 of 36.
- **Fixes found along the way:**
  - A colonist who is still hungry after a small stack of raw food goes for another bite.
  - The balance script now keeps building sites, fishing spots and the research bench where colonists
    can reach them, and re-plans a bench that gets walled off. One test colony had never researched
    anything because of this.

## 4. Phase B: Art and decor (done)

Beauty is something colonists now notice and make, and every sculpture remembers a moment from the colony's
story.

- **Sculptures, carved in place.** Small (40 wood), large (40 granite blocks) and grand (70 blocks and 40
  silver, after the Fine Arts research at 1200). A sculpture is planned like any building. A colonist with
  the new **Art** work type fetches the materials and carves it, training Artistic; builders leave it alone.
  (This replaces the sculptor's table in the original plan: carving in place uses the existing building
  system and avoids moving finished pieces about.)
- **Quality.** Artistic skill, give or take three, plus three if the artist is inspired, on the same 0–20
  scale and labels as crafted goods (Poor to Masterwork). A sculpture's beauty is its base times 0.4 to 3
  by quality, so a skilled artist's piece is worth several times a novice's. A finished piece gives the
  artist "Made a work of art" (+3). A masterwork (17+) gives "Made a masterwork" (+10, three days) and goes
  in the story.
- **Art that remembers.** Each piece is titled after a moment from the colony's recent story:
  - "In Memory of Wren" (a death);
  - "Ada and Bram" (a friendship);
  - "The Raid of Day 14";
  - "The Long Winter";
  - "Lights over the Valley" (an aurora);
  - and others.

  With nothing to draw on, it's "Ada's Spring Study". The tile inspector shows the title, quality, artist
  and day.

- **Decor without an artist:**
  - flower pots: beauty 3, a fifth of that in winter;
  - banners: beauty 2, cloth and wood.
- **Surroundings.** Beauty within two tiles (only the same room, indoors) gives "Pleasant surroundings"
  (+2, at 6+) or "Beautiful surroundings" (+4, at 15+). Standing in a bare room with nothing pleasant in it
  gives "Drab surroundings" (−1). Asleep, none of it counts.
- **Galleries and admiring art.** Sculptures are art recreation: colonists stand around them to admire
  them. A room whose recreation is mostly art is a Gallery, and an impressive one leaves "Had fun in a nice
  room". Rooms that reach 60 are now "magnificent".
- **Goals (Prosperity):**
  - carve a sculpture;
  - carve an excellent sculpture or a masterwork;
  - make a room magnificent.
- **Results** (Standard, 48 days, 12 seeds, the test colony adding a small sculpture and two flower pots
  to its hut on day 4):
  - Barracks impressiveness rose from about 40 to 68.
  - Survival, mood and breaks are unchanged (72 of 73, 48.0, 5 breaks).
  - The surroundings thoughts barely show here because that colony's hut is mostly slept in. Decorating
    where colonists eat and work is what pays.
- **Not done:** caravans buying art. Sculptures are buildings, not items, so trading them needs a way to
  pack one up. That's left for later.

## 5. Phase C: Music (done)

The colony makes music, and a good player can bring everyone together on an evening.

- **Instruments**, built in place and played from beside them as music recreation:
  - drum: wood and leather;
  - flute stand: wood;
  - lute stand: wood and cloth;
  - harp: wood and silver, after the new Instruments research at 1000.

  Playing trains Artistic.

- **Listeners.** Everyone awake within six tiles hears it (indoors, only those in the same room). It fills
  their recreation a little, with more from a better player, and gives "Heard some music" (+2), or "Heard
  beautiful music" (+4) from a player with Artistic 10+.
- **Concerts.** A player with Artistic 6+ playing between 17:00 and 22:00, with someone else off duty, may
  strike up a two-hour concert, which goes in the log.
  - Off-duty colonists who are doing something for fun, or nothing much, come along. They gather within
    three tiles, enjoy the best music recreation there is, and chat with one another.
  - The player gets "Gave a concert" (+5) and listeners "Went to a concert" (+4).
  - A concert stops if the player is drafted or called away, and then it doesn't count.
- **Goals (Prosperity):** build a musical instrument; hold a concert.
- **Sound** (Settings › Sound, off by default): made in code with Web Audio, with no sound files.
  - Each instrument has its own voice: the drum a falling-pitch thump, the flute a sine wave with vibrato,
    the lute a bright pluck, and the harp a soft, ringing triangle wave.
  - Tunes are seeded per colonist in a pentatonic scale. Tempo rises with skill, and a beginner hits the
    odd wrong note and drifts off the beat.
  - Music out of view plays quietly, and it stops while the game is paused.
  - Ambience: wind, plus rain in wet weather and storms, birds by day and crickets by night.
  - Alerts: a horn for raids and maddened animals, a falling pair of notes for a death, and a chime for a
    finished goal or a concert starting.
  - Sliders for overall volume, music, and ambience and alerts.
  - If sound was left on from a last visit, it starts at the first click or key press, as browsers
    require.
- **Results** (Standard, 48 days, 12 fresh seeds, the test colony adding a lute on day 4):
  - The lute became the second most-used recreation, and there was about one concert per colony.
  - Survival was 72 of 73, against 71 of 73 without this phase.
  - There were 2 mental breaks, against 4.
  - Average mood was 48.6, against 48.2.
- **Fix found along the way:** Esc pressed while a checkbox or slider had focus was treated as leaving a
  text field. It took an extra Esc to close Settings, and it could leave the game paused behind the
  menu. Only text fields count now.

## 6. Phase D: Gatherings, rites and festivals (done)

Recreation, art and music come together in the moments a colony shares. All of them run on one gathering
system (`src/sim/gatherings.ts` for the definitions, the "Gatherings" section of the simulation for the
behaviour):

- One gathering at a time, planned or under way, centred on a tile.
- Attendees come to a free spot within three tiles of it. While there, they fill up on social recreation
  and chat with whoever else came.
- Staying half an hour counts as having been there.
- A raid calls off anything planned or under way.
- Parties and festivals are for whoever is off duty. Weddings and funerals are rites: everyone not dealing
  with an emergency (asleep, starving, hurt, fighting, doctoring, rescuing, warming up) comes.

- **Parties.** On an evening (18:00–21:00), no more often than every three days, a colonist with mood 65+
  sometimes throws one in the best dining room, recreation room or gallery (or outdoors near home). Two
  hours; "Went to a party" (+4).
- **Seasonal festivals**, announced at dawn for that evening:
  - Planting Day: spring day 2 at 18:00, "Celebrated Planting Day" (+3).
  - The harvest festival: autumn day 4 at 18:00. Everyone who stays eats a meal from the stores, fine ones
    first: "Feasted at the harvest festival" (+6), or "Celebrated the harvest" (+3) with nothing in store.
  - The midwinter bonfire: winter day 3 at 19:00, beside a campfire or hearth if there is one. "Sang round
    the midwinter bonfire" (+5).

  The Story screen has a toggle to skip them.

- **Weddings.** At dawn, lovers whose opinion of each other is 60+ may decide to marry that evening at
  17:00, in the colony's most impressive room. If both are there to the end:
  - They're married: "Just married" (+12, five days), then "Married" (+3) for good.
  - Guests get "Went to a wedding" (+5).
  - Married couples never break up. A death leaves the other widowed.
  - If either can't come (drafted, downed), the wedding is called off and may be announced again.
- **Funerals and graves.**
  - A death puts the colonist on a list waiting for burial. For four days after a death, while anyone lies
    unburied, everyone has "One of us lies unburied" (−2).
  - With an empty grave (Art & decor: 10 wood), the colony holds a funeral there by day (08:00–19:00).
    Mourners get "Said goodbye at a funeral" (+2), and their grief thoughts fade in half the time.
  - The grave then reads "Here lies Wren, died of blood loss on day 21".
- **Memorials.** The memorial stone (40 stone) is carved by an artist like a sculpture, with quality from
  Artistic. Its inscription names the fallen ("In Memory of Wren and Kip", or "To Our Fallen" for many).
  Finishing it eases everyone's grief, and while one stands, anyone who knew a death gets "The fallen are
  remembered" (+2).
- **Notices.** A planned or running gathering shows in the side panel as good news ("The wedding of Ada and
  Bram at 17:00"), and clicking it moves the camera there. A gathering starting plays a chime with sound on.
- **Goals (Prosperity):**
  - hold a harvest feast;
  - celebrate a wedding;
  - give a fallen colonist a funeral;
  - raise a memorial.

  The last two appear only after a death.

- **Results** (Standard, 48 days, 12 seeds, the test colony adding two graves on day 6):
  - Mood rose from 48.6 to 49.5, and everyone survived (72 of 72).
  - There were about six festivals, one or two parties and one wedding per colony, and a few harvest
    feasts (most test colonies have no meals in store by autumn).
  - There were 6 mental breaks, against 2, spread thinly over three colonies.
  - Harsh, 30 days and 12 seeds: 72 of 72 survived, with 2 breaks.
  - Funerals are covered by tests rather than the balance runs, because no test colony lost anyone.

## 7. Decisions

Settled:

1. **Skills:** one Artistic skill covers both art and music.
2. **Sound:** a small synthesizer in code, no sound files. Off by default, with volume sliders in Settings.
3. **Instruments:** buildings, played in place.
4. **Hunger:** starving colonists (food at zero) now work at 80% and walk at 90% until they eat; it doesn't
   kill. In balance runs a harder version (70% and 80%) cost Harsh colonies 13 colonists over 18 seeds,
   because starving colonists are often the ones carrying the wounded in and tending them; the milder one
   costs about 7 on Harsh, which fits its "expect losses" billing, and none extra on Standard or Peaceful.
   Malnutrition that can kill stays off the table for now.
5. **Wolf packs:** a maddened wolf pack now stops at four, however big the colony. Boar packs still grow to
   five. (Earlier, a pack of six wolves downed all eight colonists in one run and five bled out.)

Settled since:

- **Downed and alone.** With nobody on their feet who can doctor, a downed colonist crawls out of the cold
  or heat (as before) and, below 15% food, to the nearest food within 25 tiles, which they eat where it
  lies. Doctors now feed a starving patient before tending wounds that aren't bleeding.
  - Starving hours while downed didn't drop measurably in the harness. Most come either from colonists
    with no food in reach, or from doctors busy for long stretches tending many wounded.
  - Starving doesn't kill, so this is left there.
- **Gatherings across a save.** Attendance is kept on the gathering itself, so loading a save partway
  through a wedding or festival no longer forgets who was there.

## 8. Later and maybe

- Cleaning and filth: blood, debris and rubble that lower beauty, and a Cleaning work type.
- A crafted look for each sculpture by quality.
- Caravans buying art.

Done since:

- **Visual pass.**
  - Colonists, traders and raiders stride as they walk, and animals hop.
  - The sky follows the clock: a golden hour, dusk through violet to night blue, and a quick rosy dawn.
  - Fires and heaters flicker warm, stoves glow dimly, and sun lamps shine steady while the grid runs. So
    do the new standing lamp (Electricity) and the new torch. Settings › Display turns the lighting off.
  - Each ground type has four looks (tufts, flowers, pebbles, ripples, shells, cracks) in each of four
    seasons, and the ground repaints when the season turns.
- **The long game: the signal beacon** (`src/sim/beacon.ts`, goal phase 6, Legacy).
  - Research it (3000, after Electricity), then build it: 60 stone, 60 silver and 40 wood, drawing 400 W.
  - Every powered hour counts. After 120 hours (five days) a ship answers, and it lands beside the beacon
    two days later.
  - While the beacon transmits, raids are half again as likely.
  - When the ship lands the game pauses and asks:
    - Board it, and the colony's story ends with a summary of its days, losses, winters, raids, research,
      sculptures, concerts and weddings.
    - Stay, and the ship leaves and the beacon can call again.
    - Do nothing for a day and it leaves on its own.
  - Balance, 60 days on 12 seeds: the test colony researches the beacon in its second year and gets a ship
    about every week after that, always choosing to stay. Everyone survived (72 of 72).

## 9. Every phase is done when

- New content is defined in `src/data/*.json`, with art in `textures.ts`, and works on all three map sizes.
- The simulation stays deterministic: anything random goes through `sim.rng`, and new state is saved and
  survives a save and load.
- It has tests in `src/sim/*.test.ts`, and the full suite, type check, lint and formatting pass.
- The balance harness shows no regression in survival, mood or starvation, and the phase's own metrics move
  the way the phase intends.
- The UI shows it:
  - the inspector;
  - hints on the build tools;
  - goals;
  - notifications;
  - the README.
- It's checked in the browser at desktop and phone sizes.
