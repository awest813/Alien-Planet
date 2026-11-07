# Colony Alpha roadmap: the next phases

A working plan for what comes after the current build. The direction so far: **art and decor, musical
instruments, recreation, and more**. Each phase lists what it adds, how it fits the systems the game already
has, what it needs first, and how we'll know it works. Section 7 records the decisions made so far.

## 1. Where the game stands

Every phase planned here is done (sections 2–6), and so is everything from the "later" list (section 8).
The simulation covers survival, farming, cooking, crafting, research, power, seasons, weather and fire,
health and disease, raids and manhunters, trade, wildlife and husbandry, traits and relationships, culture,
and a long game that lets a run end on the player's terms. The in-game goals run through six phases:
Shelter, Living, Story, Seasons, Prosperity, Legacy.

| System     | Today                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Recreation | Kinds (relaxing, physical, games, music, art, nature, social) with tolerance and variety thoughts.  |
| Beauty     | Furniture, floors, sculptures by quality and flowers by season; felt within two tiles and in rooms. |
| Hygiene    | Blood, rubble and tracked-in dirt lower beauty, spoil meals and tending, and a Clean work type.     |
| Rooms      | Roles: bedroom, barracks, kitchen, workshop, dining room, recreation room, gallery.                 |
| Skills     | Ten, with Artistic for sculpting and music.                                                         |
| Social     | Chats, deep talks and insults; friends, rivals, lovers and marriage.                                |
| Story      | Storyteller events, gatherings and festivals, story log, the signal beacon ending.                  |
| Sound      | Made in code, off by default: instruments, concerts, ambience.                                      |
| Prisoners  | Wounded raiders captured, held in prisoner beds and won over by wardens.                            |
| Death      | Graves, funerals and memorials.                                                                     |

Balance figures are kept with each phase's results below.

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

Nothing waiting: everything listed here has been done.

Done since:

- **Prisoners and recruiting** (`src/sim/prisoners.ts`).
  - Half the raiders brought down fall wounded instead of dying. They lie where they fell and die within
    a day unless taken in.
  - A **prisoner bed** (Security, 20 wood) holds one prisoner; colonists never sleep in it.
  - The **Capture** order (Orders tab) marks wounded raiders. Once no raider is left fighting, colonists
    with the new **Warden** work type carry them to a free prisoner bed.
  - Wardens bring a prisoner food below 40% (they get hungry half as fast as someone up and about), and
    talk with each prisoner every six hours between 8:00 and 21:00. Each talk wears down resistance
    (5–8 to begin with, more from a hardened faction) by the warden's persuasion: their mood, better
    when kind, worse when abrasive. Once it's gone, each talk has about a one-in-three chance of winning
    them over; they join with their Combat skill.
  - A prisoner left starving hardens, and dies after two days of it. Taking their bed down lets them
    slip away. A prisoner can be released from the **Prisoners** screen (top bar, while anyone is held).
  - Alerts point out wounded raiders, a missing prisoner bed or warden, and a starving prisoner. New goal
    (Prosperity): take a raider prisoner and win them over.
  - Balance, 48 days on 12 seeds, with the test colony building one prisoner bed on day 8 and marking
    every wounded raider: on Standard, 63 raiders fell wounded, 12 were taken and 10 won over, and 82 of
    83 colonists survived (mood 49). On Harsh, 39 fell wounded, 7 were taken and 5 won over, and 77 of 81
    survived (mood 47; the four lost bled out in raids as before).
- **Hygiene: mess has consequences.** Mess within two tiles (indoors, the same room only) now matters
  beyond beauty:
  - A meal comes out a grade worse for each level of mess around the stove, up to six. A worse meal is
    less safe to eat (food poisoning already depended on the cook's work).
  - Tending loses 0.04 of its quality for each level of mess around the patient, up to 0.3, so a dirty
    sickroom heals wounds more slowly.
  - Six levels or more around someone awake indoors gives "Filthy surroundings" (−3).
  - Cleaners see to mess indoors before mess outside. The inspector warns at a stove or bed with mess
    nearby.
  - Balance, 48 days on 12 seeds: Standard kept everyone (72 of 72; 6 breaks, mood 50). On 12 fresh Harsh
    seeds it matched the version before (72 of 75 against 72 of 74, mood 49.5 against 49.4). One Harsh run
    lost four to a wolf pack that downed all ten colonists: a different run of events, not the mess.
- **Cleaning and mess** (`world.filth`, a layer saved with the map).
  - Blood is left by wounds (colonists, raiders and animals), and an untended wound drips as its owner walks.
  - Rubble is left by mining, demolition, walls broken by raiders and buildings lost to fire.
  - Dirt is tracked onto floors by anyone stepping in off bare ground, three times as often in rain or storm.
  - Each tile holds one kind, up to three levels. Each level takes beauty off the room and the surroundings:
    dirt 0.5, rubble 1, blood 1.5. Rooms count it as soon as it appears or is cleaned.
  - A new Cleaning work type (last in the work order, no skill) scrubs mess indoors, on floors, and within
    12 tiles of the colony's middle, a level about every seventh of an hour. Out in the open, weather wears
    mess away in a day or two, and rain does it within hours. A wall built over mess buries it.
  - The inspector names the mess on a tile.
  - Balance, 48 days on 12 seeds: everyone survived (72 of 72) on Standard and Harsh, with 1 and 10 breaks.
    Cleaning took about half a percent of colonists' time; a few messy tiles stand under a roof at the end,
    and the barracks lose some impressiveness to it (about 50 against 67 before, depending on what was just spilled).
- **A distinct look for sculptures by quality.** Poor work shows cracks, excellent work a silver trim and a
  gleam, and a masterwork a gold-trimmed plinth with a slow twinkle.

- **Caravans buy art.**
  - When traders are in town, the Trade screen lists the colony's sculptures under "Sell art", with title,
    quality and artist. They buy a piece where it stands and carry it off, so nothing needs packing up.
  - The price comes from its size (small 120, large 300, grand 800 at normal quality), scaled by quality
    (a masterwork is worth about twice a normal piece) and by the traders' usual cut, which shrinks as
    goodwill grows.
  - A normal small piece fetches about 65 silver against roughly 40 wood to make; a masterwork large one,
    about 360.
  - Each sale is confirmed, raises goodwill by 3, and goes in the story. Memorials aren't for sale, and the
    traders can only pay what's in their purse.

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
- The 100-player playtest (`scripts/playtest.ts`) runs clean: no crashes, no invariant problems, and every
  sensible play style keeps its colony.

## 10. Next: what the genre's best do that we don't

An audit against four colony and settlement games the direction draws on: RimWorld (story-driven colony
survival), Dwarf Fortress (deep simulation and emergent history), Clanfolk (a family clan through hard
winters, everything made from raw materials) and First Feudal (a medieval village grown by assigning people
to work). We take **mechanics** from the genre, never content: no names, creatures, items, art or
storylines from any of them. Everything below is designed to fit Colony Alpha's alien valley and its
existing systems.

### Audit

| Area                | The genre at its best                                                        | Colony Alpha today                                                        | Gap        |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- |
| Storage & hauling   | Stockpiles with item filters and priorities; shelves; forbidding items       | One stockpile kind that takes everything; iceboxes and freezers           | Large      |
| Heating & fuel      | Fires burn fuel; firewood is cut and stored for winter                       | Campfires and hearths heat for free; generators burn wood                 | Medium     |
| Food & preservation | Many crops; milling, baking, smoking, drying, cellars; seasonal stocking up  | 3 crops; meals and fine meals; cold storage by power or ice               | Large      |
| Materials           | Long chains: clay to pottery, ore to metal, flax to linen, hides to leather  | Wood, stone, blocks, cotton, wool, leather, silver; no metal, no smelting | Large      |
| Life & family       | Ages, children growing up, elders, generations, family homes, inheritance    | Ageless adults; lovers marry; no children                                 | Large      |
| Character           | Backstories; varied mental breaks; inspirations; obsessive artifact-making   | 12 traits, passions; one kind of break (a daze); one kind of inspiration  | Medium     |
| Body & medicine     | Body parts, scars, lasting injuries, infection, surgery, hospitals           | Wounds by severity, bleeding, one disease, tending with medicine          | Medium     |
| Society             | Leaders and offices, laws and policies, justice, a village that votes        | Opinions, friends, rivals, gatherings; no roles beyond work priorities    | Large      |
| Factions & world    | Diplomacy, gifts, alliances, quests, a world map, expeditions, outposts      | Raiders, traders with goodwill, prisoners; one map                        | Large      |
| Depth               | Digging down through layers, caverns, ores and dangers below                 | One surface layer; rock is mined flat                                     | Very large |
| History & legend    | A chronicle; engravings and artifacts that record events; named great beasts | Story log, art titled after events, memorials, a legacy summary           | Small      |
| Threats             | Sieges, great beasts, infestations from below, plagues, betrayal             | Raids that grow, maddened packs, one fever, fire, weather events          | Medium     |

The core loop is solid: survival, a storyteller, combat, culture, rites and a long game. What's thin is
**depth of production** (Clanfolk, Dwarf Fortress), **life across generations** (Clanfolk, First Feudal),
**variety of minds and bodies** (RimWorld) and **a world beyond the valley** (all four).

### The phases, in order

Ordered so each builds on the last, with the cheapest high-value work first. Each lists a first slice that
can ship on its own.

**Phase E: Storage and fuel.** _(Small–medium. Foundation for everything after.)_

- Stockpile settings: allowed categories (food, materials, weapons, apparel, medicine, art supplies) and a
  priority (low to critical); haulers move items to better stockpiles. Shelves hold three stacks on a tile.
- Forbid and allow, on items and doors (keep colonists out of a cell block or a storeroom).
- Firewood: campfires, hearths and torches burn wood; haulers refuel them (the refuel job exists for
  generators). Winter prep becomes a real chore: a woodpile to fill before the cold.
- First slice: stockpile categories and priorities. Success: no regression in the harness, fewer haul trips
  per item delivered.
- **Done (first part):**
  - Fires burn wood: a campfire holds 30 and burns 10 a day, a hearth 60 and 15, a torch 10 and 2. A fire is
    built with a first load, gives no heat or light once it's out, and haulers refuel it (urgently below a
    fifth). Rooms work out their heat again the moment a fire goes out or is lit. Alerts warn when the
    woodpile is under three days of burning, and when a fire has gone out.
  - Stockpile settings, kept in the zone value (no new saved state): the groups it takes (food, materials,
    gear, medicine) and a priority (low, normal, high, critical), set for a whole stockpile from its tile
    card. A stockpile drawn beside one carries its settings on. Each storage tile has a value for each item
    (priority, plus a little for perishables in cold storage); haulers move items only to somewhere better,
    so nothing shuttles back and forth.
  - Forbid and Allow orders: forbidden items are left alone by every job (they count as taken), marked
    with a red cross, and allowed again once the tile empties.
  - Balance, 48 days on 12 seeds: everyone survived on Standard and Harsh (75 of 75 each). In the
    100-player playtest every sensible style kept its colony once its test player chopped more wood when the
    woodpile ran low; colonies that never shelter or that tear their shelter down still freeze.
- **Done (second part):**
  - Shelves (25 wood): storage that holds three stacks of one kind of item on a tile. A stockpile painted
    over a shelf sets what it takes; without one, it takes anything at normal priority.
  - Locked doors: lock or unlock a door from its tile card. Nobody passes a locked door: not colonists, not
    animals, not raiders, who have to break their way in as through a wall (and in practice pick the
    nearest wall). Rooms and reachability follow the lock, so nobody plans a route through it. A door
    broken down or rebuilt comes back unlocked.
  - Found by the 100-player playtest:
    - Colonists went out for recreation (and idled about) on freezing nights while a warm hut stood
      nearby, and whole colonies froze on the first winter night. Recreation and idling now stay within
      6°C of a colonist's comfort (cleaning within it), unless they're in a daze.
    - A new alert when colonists get dangerously cold indoors (the room needs another fire, a hearth, or
      parkas), as soon as it's colder than their clothes can take.
    - Mess left on a door once it's locked is cleared.
  - Balance, 48 days on 12 seeds: Standard kept everyone (82 of 82; 2 breaks, mood 50.5, recreation
    short 18% of the time, as before). Harsh lost 7 of 79 to raids (blood loss), within its usual range.
    In the 100-player playtest the only colonies lost were those that never built or finished a shelter
    (neglectful, random clicking, random priorities, tearing it down, or a map with too little wood).

**Phase F: Food, materials and the seasons.** _(Medium–large.)_

- New crops with their own seasons and uses: a grain (milled to flour, baked into bread that keeps), a
  fibre crop for a second cloth, a hardy root that grows into autumn.
- Preserving: a drying rack and a smokehouse turn meat, fish and berries into preserved food that keeps for
  a season without power. A root cellar (a dug room) keeps food cold in summer.
- Clay from riverbanks: a kiln fires pots (better storage) and bricks (a new wall and floor).
- Ore in rock (iron-like and copper-like veins shown in the rock art): a smelter makes metal; metal tools,
  weapons and armor take over from wood and stone in the mid game.
- First slice: grain, mill, bread and the drying rack. Success: Standard colonies reach winter with more days
  of food, and fewer starving hours without needing power.

- **Done:**
  - Grain (a crop, 12 a plant over two and a half days) is milled at a millstone (Milling) into flour, and
    a cook bakes flour into bread at the stove: food that keeps a month without power. Cooking work runs
    the millstone.
  - Drying racks (15 wood) are storage for raw meat, fish and berries only; haulers bring them there first,
    and in 12 hours (twice as long in the rain) they dry into dried meat or dried berries that keep two
    months. Dried food is then hauled to a stockpile.
  - Clay banks along the shore and iron veins in the rock (with a small vein guaranteed near the landing),
    both mined. A kiln (Pottery) fires clay into bricks for brick walls and floors; a smelter (Smelting,
    after Pottery) turns iron ore into iron for tool kits, an iron sword and iron mail. Both burn wood, but
    only while they're worked, and nobody works them cold.
  - Goals (Prosperity): bake bread; smelt iron.
  - Balance, 48 days on 12 seeds, with the test colony building a drying rack on day 3 and, once Milling
    is done, a grain field and a millstone: Standard kept everyone (77 of 77), starving hours a little down
    (1,672 against 1,714), food stores about the same, now partly bread and dried meat that keep without
    power. Harsh lost 2 of 79, both in raids. The 100-player playtest was clean (no crashes or invariant
    problems).
  - Not done from the plan: the fibre crop, the hardy root, the root cellar and pots (clay storage).

**Phase G: Lifespans and families.** _(Large: touches colonists everywhere.)_

- Ages and a calendar of birthdays (a year is 24 days, so ages advance at roughly a year per in-game year
  and lifespans span a long run).
- Children: married couples may have a child (a pregnancy over most of a season). Children grow through
  stages: babies need care, children learn skills by watching and play instead of working, teenagers do
  light work. They take after their parents' traits and passions.
- Elders: past a certain age, slower and frailer, but teach faster; death of old age eventually.
- Family homes: assign a bedroom to a family; family members get opinions of each other built in.
- Backstories: each colonist's past (a few lines and a skill tilt), generated from a pool of original
  backstories, shown in the inspector.
- First slice: ages, backstories and births to married couples (children as non-working colonists who grow
  up). Success: in long harness runs (120 days) a second generation joins the work force.

- **Done** (`src/sim/lifespans.ts`, `src/data/backstories.json`):
  - Ages: a year is 24 days. Starting colonists are 18 to 52, each with one of 20 original backstories
    that tilts their skills (a galley cook cooks better, a station guard fights better).
  - Children: a married couple between 18 and 50 may start expecting (5% a day, one baby at a time, while
    the colony has room for three more than its usual size). Six days later the baby is born, and a parent
    carries and cares for them (getting hungry a fifth faster) until they're 3. Then they join the colony
    as a child, taking after their parents' traits and passions, with "Born in the valley" as their past.
  - Growing up: children grow six times faster than adults age, so a child born in the colony comes of age
    within a long game. Children (3–12) don't work, but learn by watching adults at work nearby. Teens
    (13–17) do light work: hauling, cleaning, growing, cutting plants, art. Nobody under 16 is drafted.
    Coming of age is a story moment.
  - Old age: from 65, colonists work and walk a little slower; from 70 each birthday may be their last.
  - Families: no romance between family members or with the young. Parents grieve a child above all (−25),
    and everyone is glad of a birth. The inspector shows age, stage, backstory and family; the Work screen
    shows who is too young for what; children are drawn smaller.
  - Goal (Prosperity): welcome a child born in the valley. The end-of-story summary counts children born.
  - Balance, 48 days on 12 seeds: Standard kept everyone (78 of 78; mood 51.6, starving hours down to
    1,075), with 5 children born. Harsh lost 1 of 79 in a raid, with 7 born. Over 120 days on 6 seeds, 7
    children were born and 3 grew up into adults.
  - Found along the way: the balance harness placed its research bench only on day 2, so a colony with no
    spot that morning never researched anything (no parkas, no hearth) and froze. It now tries every day.

**Phase H: Minds.** _(Medium.)_

- Mental breaks by kind and severity: a sulk in their room, a food binge, a tantrum that breaks something, a
  hiding spree, walking off for a day; traits steer which (an abrasive colonist picks fights).
- More inspirations: a creative burst (next sculpture or instrument piece is much better), a taming knack, a
  fighting rage, a teaching mood.
- Obsessions: rarely, a skilled colonist is seized by an idea, claims a workshop, demands particular
  materials, and makes a one-of-a-kind named artifact of legendary quality, recorded in the story. If the
  materials never come, they break down.
- First slice: three kinds of break and two inspirations. Success: breaks feel different in the story log,
  with no rise in deaths.
- **Done** (`src/sim/minds.ts`):
  - Four kinds of mental break: a daze (as before), a sulk in bed for the whole break, a food binge (eating
    whether hungry or not), and a rage that smashes one nearby piece of furniture (rubble, and it goes back
    on the build list), then burns out into a daze. Gluttons binge, pessimists sulk, the abrasive rage and
    the kind never do; children only sulk or wander off in a daze. The inspector and alerts say which.
  - Inspirations, chosen to suit the colonist: working faster (as before), a creative spark (their next
    sculpture is six levels better), a way with animals (their next taming attempt always works), and a
    teaching mood (children nearby learn three times as fast what that adult knows best).
  - Obsessions (rare: from day 14, at most once every 40 days, and only to a content artist, mood 55 or
    more): the colony's most skilled artist or craftsman is seized by a vision and plans a legendary sculpture near home that only they may carve,
    needing 30 granite blocks, 25 silver and 20 wood within eight days. An alert tracks what's still missing. Done in time, it's
    a quality 20 piece of great beauty, and a story moment that lifts everyone; neglected, the artist snaps
    into a long rage and is downcast for days.
  - Balance, 48 days on 12 seeds: Standard kept everyone but one lost in a raid (82 of 83; 3 breaks, mood
    50.5), with 6 obsessions and 2 legendary sculptures. Harsh lost 1 of 77 in a raid; its 21 breaks are
    mostly one colony that starved for over a thousand colonist-hours. The 100-player playtest was clean.
  - The balance harness now counts every kind of break (it only counted dazes), and its test colony
    answers an obsession as a player would: a stonecutter's table, more mining, and more blocks on the
    bills. Without that it never had blocks to give, and every obsession ended in a breakdown. Tuning from
    those runs: obsessions were too frequent and too hard at first (11 in 12 colonies, mostly failed), so
    they're rarer, need less, allow more time, and come only to a content artist.
  - Not done from the plan: hiding sprees, walking off for a day, and a fighting rage.

**Audit of phases E to H.** Three independent reviews and a 30-day, 100-player playtest with new checks
(babies always have a carer, ages make sense, only doors lock, storage within capacity, racks hold only what
dries, fuel within its tank, an obsession always has its blueprint). Fixed:

- Hauled or dropped items merged into a forbidden stack and became forbidden too: forbidden stacks now take
  nothing more.
- Drying progress belonged to the rack tile, so a new stack could finish in an hour; it now goes with the
  stack, and fresh food added to a drying stack dilutes it.
- Saves from before fires burned wood loaded with every fire empty; they're lit with a full load.
- An obsessed artist carrying anything looped forever, and skipped eating and bed rest; their vision now
  comes after their own needs.
- Children could be pulled into tending, firefighting and refuelling through emergency paths. A child joins
  with every work priority off, gets light work at 13 and the rest at 18, and the Work screen can't turn on
  work they're too young for. Rescue and raid size count only those old enough.
- Rages could smash bridges (stranding whoever was on them), traps and sandbags; they don't any more.
- A legendary sculpture lost to fire came back as a blueprint nobody could carve; lost art isn't rebuilt.
- Children could inherit clashing traits (optimist and pessimist); conceptions could overshoot the colony's
  room; a baby whose adults were all gone vanished silently (a teen now takes them in, or it's told).
- A failed obsession always ended in a rage, even for the kind; it now breaks in their own way. Sulks end
  with the break. Visitors are moved out of a doorway that gets locked.
- Alerts: forbidden wood no longer counts as wood in the fire and woodpile alerts, nor forbidden materials in
  the obsession alert (which also clears at once if the artist dies, and says "1 day"); a fire that's merely
  out no longer says "nowhere warm to shelter"; children no longer show as having nothing to do; shelves and
  iceboxes count as storage; "stockpiles are full" respects what stockpiles take; blueprints now say how to
  get bricks, clay, iron and silver; a kiln's wood is shown as hours of work; a colonist who died expecting no
  longer shows it.
- The Allow tool drags in green; "too young" cells on the Work screen have screen-reader labels; grain has
  feature art for its blueprint.
- Left for later: relatives a generation apart (grandparents, cousins) aren't yet treated as family for
  romance, and the forbidden flag doesn't follow items moved off a doorway being locked.

**Phase I: Bodies and medicine.** _(Medium.)_

- Wounds land on body parts (head, torso, arms, legs, hands, eyes). A lost or ruined part means a lasting
  effect (a limp slows walking, a bad hand slows work, a lost eye worsens aim). Scars hurt in the cold.
- Infection in untended or dirty wounds (ties into hygiene). Hospital beds and an infirmary room role give
  better tending and recovery.
- Simple surgery and aids: a crutch, a wooden limb, later metal ones (Phase F's metal).
- First slice: body parts with lasting injuries, infection, hospital beds. Success: Harsh survival holds
  steady while wounded veterans show visibly in the colony.
- **Done** (`src/sim/body.ts`):
  - Wounds land on a body part (torso, arm, leg, hand, head, eye) and remember how bad they were.
  - Infection: an open wound (a cut or an arrow wound) left untended, or tended somewhere filthy, may turn
    infected. An infected wound worsens instead of healing until a doctor treats it: surely with herbal
    medicine, otherwise as well as their skill allows. It can kill ("infection"). Alerts and the inspector
    show it, and it weighs on the patient's mood.
  - Lasting injuries: a bad wound (more often if poorly tended or infected) may leave a mark when it
    heals: a leg a limp (walks 15% slower), an arm or hand a stiff hand (works 10% slower), an eye a lost
    eye (aims worse), the torso or head a scar that aches. The health tab lists them.
  - Hospital beds (Field medicine; 30 wood, 10 cloth): patients prefer one indoors, heal half again as fast,
    are tended better and catch half the infections; a room that's mostly hospital beds is an Infirmary.
  - Balance, 48 days on 12 seeds, the test colony adding two hospital beds after Field medicine: Standard
    kept everyone (79 of 79; mood 50.6), with about three infections and one lasting injury in three
    colonies. Harsh lost 6 of 82 in raids, within its usual range.
  - Tuning from the runs: infections were far too common at first (13 a colony; bruises festered too), and
    patients would walk out to a hospital bed in the open; open wounds only, half the risk, and hospital
    beds only count indoors.
  - Not done: crutches and artificial limbs, and surgery.

**Phase J: The village and its people.** _(Large.)_

- Offices, filled by vote at a gathering: a leader (a small mood lift when the colony is well run, and
  speeches at festivals), a quartermaster, a warden (the prisoner work today), a healer.
- Policies the leader can set: ration sizes, curfews, a work day, whether to keep prisoners, festival days.
  Each pleases some colonists and annoys others (by trait).
- Justice: a colonist who steals or hurts someone in a break faces the colony's choice: forgive, confine,
  or exile.
- First slice: a leader chosen by vote and three policies. Success: policies move mood and output in the
  harness in the directions intended.

**Phase K: Factions and the wider world.** _(Large.)_

- Diplomacy: gifts, envoys, alliances and tributes; allied factions send help in raids, enemies can be bought
  off.
- Requests from factions: deliver goods, shelter a traveller, hunt a dangerous beast, for silver, goodwill or
  a recruit.
- Expeditions: send colonists off the map (a world view of nearby sites) to trade, scavenge a ruin or rescue
  someone, and come back days later (or not).
- First slice: requests and gifts. Success: goodwill swings matter and requests get done in the harness.

**Phase L: Into the rock.** _(Very large; decide whether to do it at all.)_

- A second layer beneath the valley, reached by a stairway dug into rock: caverns with their own plants and
  creatures, richer ore, underground water, and things that come up if you dig too far.
- The renderer shows one layer at a time; pathfinding and rooms work across stairs.
- A cheaper version: mine shafts that yield ore over time, and cavern breaches as a storyteller event, with
  no second map layer.
- First slice: decide between the full layer and the shaft version (see the questions below).

**Phase M: Legends and great threats.** _(Medium.)_

- A chronicle screen: the colony's history by year, built from the story log, deaths, marriages, births,
  artifacts and battles.
- Wall engravings: a mason carves a scene from the chronicle into a stone wall (beauty, and a record).
- Great threats with names and histories: a vast beast that wakes once a year, a siege that camps and builds,
  an infestation from below (Phase L).
- First slice: the chronicle and engravings. Success: a 120-day run reads like a history.

### What to measure

- Extend the balance harness for each phase (food days with preservation, generation size, break kinds,
  lasting injuries) and the 100-player playtest with new personas (a family planner, a hoarder who never
  sorts storage, a policy tinkerer).
- Long runs become routine: 120-day runs on a few seeds, to see generations, legends and late-game threats.
- Performance budget: under 60 ms per 1,000 ticks on a Large map, checked with each phase.

### Decided

1. **Generations:** yes. Colonists age, have children, and die of old age.
2. **Depth:** the cheaper version: mine shafts that yield ore over time, and breaches from below as events.
   No second map layer.
3. **Fuel:** campfires, hearths and torches burn wood.
4. **Order:** as planned, starting with Phase E (storage and fuel).
