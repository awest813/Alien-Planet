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

## 2. Groundwork (do first)

These are small, but every later phase leans on them.

1. **A bigger tileset.** Art is drawn in code (`src/render/textures.ts`) into a fixed grid with room for 48
   buildings and 32 items. 39 buildings and 29 items are already used. Work out the rows from the
   definition counts so new content never hits the limit.
2. **Recreation kinds.** Each joy source gets a kind: relaxing, gaming, social, outdoor, music, art. The
   recreation, music and art phases all hang off this.
3. **An Artistic skill.** A tenth skill used for sculpting and for playing music, plus an Art work type
   (a column on the Work screen). One skill rather than two keeps the Work screen readable. (Decision 1.)
4. **Harness metrics.** The balance script reports mood broken down by thought, how much of the time the joy
   need is low, and the average impressiveness of each room role, so each phase can be measured before and
   after.

## 3. Phase A: Recreation depth

Today a colony with one armchair has solved recreation forever. The goal is variety, and recreation that
brings people together.

- **Tolerance.** Doing the same kind of recreation over and over gives less each time and recovers over a
  few days. A colonist with three or more kinds available gets a "Varied recreation" mood thought; with only
  one, a "Same old thing" thought.
- **New joy buildings** (data in `features.json`, art in `textures.ts`):
  - Chess table (wood and stone): gaming, two players. Players chat while they play, so it builds opinions.
    Rivals won't sit down together.
  - Telescope (research Optics, a new cheap project): outdoor, stargazing at night under a clear sky, with
    extra mood during an aurora.
  - Card table (wood and cloth): social, up to four players.
  - Nature walks: walking near trees and water counts as outdoor recreation, so a scenic map is worth
    something.
- **Recreation room.** A good recreation room (impressive, with two or more kinds of joy) gives a mood
  thought, the way a nice dining room does now.
- **Goals:** "Offer three kinds of recreation" and "Play a game of chess" join the Living or Prosperity goals.
- **Tests and checks:** tolerance rises and falls; two-player games pair up and move opinions; rivals avoid
  each other. In the harness, the share of time joy is low drops, and so does the number of mental breaks.

## 4. Phase B: Art and decor

Beauty becomes something colonists notice and make, and art becomes a way to tell the colony's story.

- **Sculpting.** A sculptor's table (a workbench) makes sculptures:
  - Small (wood) and large (granite blocks), plus a grand version (blocks and silver) after research.
  - Quality comes from Artistic skill, from awful to masterwork, and sets the beauty value.
  - A masterwork is announced in the log and the story, and gives the artist a mood thought.
- **Art that remembers.** Each sculpture gets a title and a subject taken from the colony's own story log
  ("Kip Holding the Door Against the Rust Wardens", "The Long Winter of Year One"). The tile inspector shows
  it, and caravans pay well for it.
- **Decor that needs no artist:**
  - Flower pots and planters: the grower tends flowers, which add beauty while in bloom and wilt in winter.
  - Rugs (cloth).
  - Banners and wall hangings (cloth and wood).
  - Torches and standing lamps: beauty, and a little light at night.
  - Memorials: see Phase D.
- **Beauty where colonists are.** Colonists get mood from what's around them (the beauty within a few tiles),
  not only from their bedroom and the dining room. "Pleasant surroundings" and "Drab surroundings" thoughts
  make a bare stone hall feel bad.
- **Galleries.** A room whose beauty comes mostly from art becomes a gallery. Looking at art is a recreation
  kind.
- **Goals:** "Make a sculpture", "Make a masterwork", "Have an impressive room" (Prosperity).
- **Tests and checks:** quality follows skill; beauty feeds impressiveness and the new thoughts; titles come
  from real story entries. In the harness, average room impressiveness and mood go up, and selling art makes
  a modest amount of silver without breaking the economy.

## 5. Phase C: Music

Instruments are buildings that colonists play during recreation, and anyone in earshot benefits.

- **Instruments** (one set, crafted at the crafting bench or built in place):
  - Drum (wood, leather)
  - Flute (wood)
  - Lute (wood, cloth strings)
  - Harp (research Instruments; wood, silver)

  Playing is music recreation for the player and trains Artistic. Colonists in the same room or nearby
  outdoors get "Listening to music" joy and a mood thought that rises with the player's skill.

- **Concerts.** A good player sometimes starts an evening concert on their own. Off-duty colonists gather,
  and listening together builds opinions.
- **Real sound** (Decision 2): a small Web Audio synthesizer instead of sound files.
  - Each instrument has its own voice, and tunes come from the colonist's skill and the seed.
  - Quiet ambience for day and night, rain and wind, plus a few interface sounds (a raid warning, a
    completed goal).
  - Master, music and effects volume sliders in Settings, all off by default for anyone who prefers
    silence.
- **Tests and checks:** instruments give joy to the player and to listeners within range; skill sets the
  listeners' mood; concerts gather off-duty colonists only. Audio runs in the renderer layer, outside the
  simulation, so the simulation stays deterministic and the tests stay silent.

## 6. Phase D: Gatherings, rites and festivals

This ties recreation, art and music into the storyteller.

- **Parties.** A colonist in good spirits sometimes calls a gathering in the dining or recreation room:
  drinks, music if there's an instrument, and conversation. Everyone who attends gets a mood boost and
  better opinions of the others.
- **Seasonal festivals** (storyteller good events):
  - Spring planting day.
  - Harvest festival after the autumn harvest: a feast of fine meals, or a smaller mood boost without them.
  - Midwinter bonfire.

  Each is a short scheduled event the player can let happen or skip.

- **Rites of passage.**
  - **Weddings:** lovers marry, with a ceremony and mood for everyone.
  - **Funerals:** the fallen get a grave, and a memorial stone or statue (a sculpture subject) gives a lasting
    "Remembered" thought instead of only grief. This also fills today's gap where death leaves nothing
    behind.
- **Goals:** "Hold a feast", "Hold a wedding", "Raise a memorial".

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

Still open:

- Whether downed colonists should be able to crawl to food or a bed when nobody is left to help. Most
  starving hours in the harness are colonists lying wounded after a fight that downed everyone.

## 8. Later and maybe

- Cleaning and filth: blood, debris and rubble that lower beauty, and a Cleaning work type.
- Downed colonists who can crawl to food or a bed when nobody is left to help them.
- A visual pass:
  - walking animation;
  - day and night lighting;
  - a more varied look for each terrain;
  - a crafted look for each sculpture by quality.
- A long-game goal, for example a monument or a signal beacon that ends a run on the player's terms.

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
