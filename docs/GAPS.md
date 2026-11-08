# Gap list

Where Colony Alpha is thin, unbalanced or untested, from ten-year runs (Small, Medium and Large maps; Peaceful,
Standard and Harsh), 48-day balance runs, 100-player playtests, a newcomer's browser playthrough and code
audits. Each gap says what the evidence is and what would close it. The roadmap (ROADMAP.md) holds the longer
plans.

Tools: `scripts/balance.ts` (seeded colonies, summary; modes `defend`, `craft`, `diplomat`, `surplus`, `pen`,
`biome=`, `map=`), `scripts/years.ts` (the same, a line a year), `scripts/playtest.ts` (100 scripted players with
invariants; `npm run playtest:long` for 120 days), and `npm run test:e2e` (browser tests). Bundle the scripts
with esbuild for speed (see ROADMAP).

## Still open

- **The last research waits on materials.** Late projects need a building and materials as well as points, and
  the test colony (`craft`) learns 37 of 44 by year 4. The other seven wait one point short for iron, stone and
  stone blocks it never keeps in storage. A player who stockpiles them finishes, but the tree still ends: there's
  no repeatable study for the last years.
- **Goals reach 53–55 of 65 by year 10** in the test colony; the rest are niche or need a player's choices
  (masterwork crafts, winter greenhouses, all research).
- **A walled, armed colony still rarely loses anyone to raids.** Deaths in ten-year Standard runs now come from
  disease (the shaking sickness and grey flu, 1–2 a decade) rather than raids.
- **Mood is lower but breaks come in bursts.** The late yearly average is about 47–52 (from 52–56), but most breaks
  come around a death: a grieving colonist can break several times in a few days because the break cooldown is
  short. Separations are rare (one in six ten-year runs).
- **Elders barely appear in ten years** (founders are 18–53), so ailments, care and retirement show little in the
  usual runs; care is meals only.
- **Some dealings are thin:** there's no execute action (so that can't harden raiders); envoys and returning
  expeditions are log lines and figures at the map edge, not visitors who walk in; colonists away don't hear of
  deaths at home; the harness seldom buys settlers (its population is at the cap). Meadow Kin goodwill still
  ends at 100 in some runs.
- **The desert is the hardest land:** heat waves at the height of summer can kill several colonists before they
  get shelter. It may want gentler tuning.
- **Pens:** troughs take only potatoes, and there's no warning for a fence with no gate or a pen too big.
- **Drawing zoomed right out on a slow machine:** with 4× CPU throttling a desktop window showing the whole Large
  map takes about 28–31 ms a frame (phones about 14–16 ms). The feature layer (about 9 ms) can't use the GPU
  layer, and rebuilding the interface's state costs about 8 ms each time it's published (5 times a second), of
  which the alerts are about 6 ms.
- **Testing:** the browser tests haven't run on GitHub yet, and the long-press hasn't been tried on a real
  iPhone. Performance is still checked by hand (`scripts/perf.ts`); it's too noisy for CI. Saves from before
  version 16 can't be loaded (the game says so).

## Closed in this pass

- **Research ran out by the third year:** nine late projects (steelmaking, glassmaking, double glazing,
  reinforced walls, barbed traps, antiseptics, plant breeding, prosthetics, precision tools), each needing a
  building and materials, and the beacon now needs engineering. The Research screen and an alert say what a
  project is waiting on.
- **Goals stopped by year 4:** an eighth phase, Mastery (a winter harvest, steel, a masterwork craft, a thief
  caught, a raid seen off with nobody down, 60,000 wealth, all research), ending with ten years.
- **Silver piled up:** expedition supplies and trading purses, settlers bought from the Meadow Kin, and hired
  fighters; a fuller silver stack (2,500 a tile) so the harness's silver is in the stores where it can be spent.
  Year-10 silver is about 600–1,400 (from 6,100–9,500). Commissions from neighbours pay in goods, and ransoms
  bring silver in.
- **Nothing answered a rich colony:** raids gain up to 4 raiders above 15k, thieves come more often the richer
  the colony, and traders visit more often.
- **Harsh raids were lost whatever the colony did:** raids are capped at a fair fight against the colony's able
  fighters. Share of raids that overran the whole colony, 72 days, 12 seeds:

  | Days  | Harsh, in the open (before) | Harsh, in the open | Harsh, from sandbags (before) | Harsh, from sandbags | Standard, in the open |
  | ----- | --------------------------- | ------------------ | ----------------------------- | -------------------- | --------------------- |
  | 13–24 | 60%                         | 52%                | 60%                           | 36%                  | 5%                    |
  | 25–36 | 96%                         | 54%                | 43%                           | 8%                   | 19%                   |
  | 37–72 | 87–97%                      | 30–48%             | 59–69%                        | 4–23%                | 25–43%                |

- **Downed raiders were left to die:** the harness builds a prisoner bed for each raider marked for capture and
  puts a warden on it: 90 of 114 who fell wounded were taken prisoner in twelve 48-day colonies (from 9 of 147).
- **Raids were the same every time:** sappers dig through rock; thieves rob the stores and run; while the beacon
  transmits a third of each raid goes straight for it; vermin spoil food left on the floor, mostly in winter.
  (The named great beast, sieges and breaches from deep shafts were already in.)
- **Disease was toothless:** the grey flu (winter, catching, can kill) and the shaking sickness (rare, passes by
  touch, deadly untended); every illness weighs harder on the old. Ten-year runs now see 1–2 deaths from disease.
- **Mood sat high late:** grief that lasts weeks and returns on anniversaries; a leader the colony expects more
  of each year; the leader and elders expect rooms of their own; ageing pains.
- **Hostile factions had no goodwill:** releasing and ransoming soften them, starving their people hardens
  them, and a soft enough faction takes a truce (18 days without their raids). Raid pressure follows goodwill.
- **Goodwill with the Meadow Kin was pinned at 100:** a rival friendly faction (the Hollowstone Clans), quarrels
  where backing one costs the other, alliances with obligations and a price for refusing, and cooling above 75.
  End-of-run Meadow Kin goodwill across eight 96-day colonies: 50–99 (from 67–100, four at 100).
- **Nothing happened off the map:** expeditions to the neighbours (trade) or the ruins (salvage), gone 3–5
  days, back with goods, sometimes a recruit, sometimes hurt.
- **No fights, arguments or divorces:** arguments (5–20 a year), fistfights between rivals (0–4 a year, broken up),
  and separations for a marriage that stays sour.
- **Children only learned by watching:** lessons at a lesson board, play between children, and childhood
  memories that leave a thought and sometimes a trait when they come of age.
- **Elders only slowed down:** ailments (stiff joints, a sore back, failing eyes, frailty), meals brought to the
  frail, and retirement.
- **The kin check covered two generations:** kinship now follows the whole family tree (tested with four
  generations).
- **Wildlife was hunted out:** a "Surplus only" hunting policy leaves a breeding pair of each kind (Peaceful keeps
  9–10 wild animals through 48 days, from 2–4), and the Meadow Kin take it badly when the valley is emptied.
- **No husbandry beyond taming:** fences, gates and feeding troughs; tame animals stay in their pen, and fed
  pairs breed in any season (tame animals in harness runs: about 5 a colony, from 0).
- **One biome and one map type:** temperate, tundra, desert and forest lands; a river or a lake around an island.
- **Food was too easy on Peaceful:** Peaceful fields give a fifth less: food at the end of 48 days is 47 days'
  worth (from 65); Standard holds about 37–39.
- **No touch stand-in for right-click on the Work grid:** holding a cell steps it down.
- **Drawing zoomed out was slow:** the ground is a GPU layer, sparse layers draw only their filled tiles, and
  pawn marks no longer redraw their text every frame. With 4× throttling, a phone showing the whole Large map went
  from 57–62 ms a frame to 14–16 ms.
- **No browser tests:** a Playwright suite (every screen, save and load, the phone layout, the Work grid's long
  press) runs in CI. Long playtests run weekly in their own workflow.
- **The balance harness played one way:** `craft` (kiln, smelter, bricks, iron, gear) and `diplomat` (tribute,
  policies, requests) modes.
- **Late content in playtests:** the 120-day playtest (players 40–99) found no crashes or broken rules; the
  colonies lost were the self-wrecking personas, apart from two sealed-in huts (the harness now checks the door
  leads out, and the game says when a blueprint or a colonist is cut off).

## Fixed in the recent passes (for reference)

- **Survival:**
  - downed colonists starving;
  - deforestation and the frozen fourth winter;
  - fires before generators;
  - first-night pacing and feedback.
- **Long-run growth:**
  - recruits past the cap;
  - requests, tribute and shaft depth growing without limit.
- **Relationships and ageing:**
  - nobody ageing;
  - opinions never fading;
  - incomplete kinship.
- **Factions:**
  - goodwill pinned at 100 with pointless gifts;
  - tribute doing nothing;
  - trade ignoring condition.
- **Reporting:** the long-run report undercounting deaths and raids.
- **Interface:** history graphs on the Story screen; the colonist overview (the ☰ at the end of the colonist bar);
  phone layout (full-width cards, the goals drawer, tables that scroll with names kept in view).
- **Graphics:**
  - night shading drawn under the bright overlays, and fires lighting the dark;
  - light stopped by walls: a fire lights its own room and the inside of the walls, not the grass outside;
  - fires with flickering flames, embers and smoke;
  - seasonal trees and bushes, gold ripe crops;
  - blueprints for walls and floors told apart;
  - its own art for milk, the freezer and the air conditioner;
  - a stronger heat map, labels hidden when zoomed out, and a name fading while the mouse is over it.
- **Sound:** fights, births, fires and collapses heard; winter quiet with stronger wind.
