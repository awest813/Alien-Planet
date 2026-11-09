# Gap list

Where Colony Alpha is thin, unbalanced or untested, from ten-year runs (Tiny, Small and Medium maps; Peaceful,
Standard and Harsh), 48-day balance runs, 100-player playtests, a newcomer's browser playthrough and code
audits. Each gap says what the evidence is and what would close it. The roadmap (ROADMAP.md) holds the longer
plans.

Tools: `scripts/balance.ts` (seeded colonies, summary; modes `defend`, `craft`, `diplomat`, `surplus`, `pen`,
`biome=`, `map=`), `scripts/years.ts` (the same, a line a year), `scripts/playtest.ts` (100 scripted players with
invariants; `npm run playtest:long` for 120 days), and `npm run test:e2e` (browser tests). Bundle the scripts
with esbuild for speed (see ROADMAP).

## Still open

- **Goals reach 53–55 of 65 by year 10** in the test colony; the rest are niche or need a player's choices
  (masterwork crafts, winter greenhouses, all research).
- **A walled, armed colony still rarely loses anyone to raids.** From the second year, raids against wooden
  walls bring firebrands who set them alight once each, though not in winter or wet weather (stone doesn't burn), on top of sappers, thieves and wreckers; but in
  ten-year runs the test colony, which now buys truces, sees only 19–25 raids and loses nobody to them.
- **Separations are rare** (one in six ten-year runs). Mood is lower late (yearly average about 47–52, from
  52–56); breaks no longer come in bursts after a death (no new break within a day of the last: seed 7919 went
  from 9 breaks in ten years to 2, mean mood 48.8).
- **Elders:** about one in ten new adults (founders and newcomers) is already 55–70, so most colonies know an elder
  within ten years (one of two ten-year runs had one or two elders from year 1 and three deaths of old age; the
  other's oldest reached 63).
- **Some dealings are thin:** the harness seldom buys settlers (its population is at the cap), and Meadow Kin
  goodwill still ends at 100 in some runs. (Envoys walk in, wait about the colony, and walk off home with the
  answer; a returning expedition is seen on the road two hours out.)
- **The desert's wood:** heat waves are survivable now (one heatstroke death in a 20-colony desert sample over two
  summers), but wood is scarce, and a desert colony that doesn't plant a grove can burn the last of it and freeze in
  a later winter (one of the 120-day playtest colonies, in year 5).
- **Tundra is hard on a slow start:** trees are scarce, and a farming-first colony that hasn't finished its hut
  by the first cold can be lost (one of four sensible tundra colonies in a 36-day sample, on day 18).
- **A busy colony's simulation slows during raids.** On a Medium map `scripts/perf.ts` gives about 39 ms per
  1,000 ticks at day 8 (budget 60), and two busy 41-day crafting colonies ran at 30–58 ms through day 40 (from
  95–100 with over a thousand items lying about), but up to 68 ms in days with a raid on. What's left is spread
  thin: pathfinding, colonists choosing work, combat. At top speed even 100 ms per 1,000 ticks is only about 8
  ms of each second.
- **Elders' care beyond meals:** nothing yet eases an elder's aches or keeps them company; frail elders have
  their meals brought, and elders retire from heavy work.
- **Testing:** the long-press hasn't been tried on a real iPhone. Performance is still checked by hand (`scripts/perf.ts`); it's too noisy for CI. Saves from before
  version 16 can't be loaded (the game says so).

## Closed in this pass

- **The last research waited on materials:** research counted only what was in a stockpile, so a colony whose
  stockpiles were full sat short of iron with 93 of it by the smelter. It now counts and takes materials
  lying anywhere a colonist can reach (not forbidden), storage first; the Research screen says so. The test
  colony (`craft`) learns 42 of 44 by year 4 (from 37), with nothing held back; the harness also lays in what
  research is waiting on. (`STOCKS=1` prints a colony's workshop stocks and bills.)
- **No hay for the pens:** a grain harvest leaves 8 hay with its 12 grain, and troughs take hay first. While
  the colony's own food is short a trough gets hay or nothing (it used to get nothing at all).
- **Drawing zoomed right out on a slow machine:** far out, the features are drawn by the GPU from a copy of
  the layer, updated at most once a second. With 4× CPU throttling the whole map takes 7 ms a frame on
  Medium (from 14.6) and 10 ms on Large (from 27).
- **Large maps were lightly tested:** a ten-year run on two seeds (17 of 22 and 19 of 20 alive; deaths from old
  age, grey flu and shaking sickness) and the 100-player playtest on Large (no crashes or broken rules; the
  five colonies lost were the self-wrecking personas).
- **Map size changed the game more than the room:** see docs/MAP_SCALING.md. Raiders reached a Tiny colony in
  minutes, so on small maps they gather at the edge until there's 1.5 hours' warning, and the warning says
  when; allies arrive with the raid; traders stay their full time; a far pile of goods suggests a stockpile.
- **The browser tests ran only here:** they now run on GitHub with every push to main, and pass.

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
  pawn marks no longer redraw their text every frame. With 4× throttling, a phone showing the whole Medium map went
  from 57–62 ms a frame to 14–16 ms.
- **No map bigger than 128×128:** the sizes are now Tiny (64), Small (96), Medium (128, the old Large) and
  a new Large, 192×192, with six colonists and room for fifteen. Over 48 days on six seeds it kept 90 of 90
  colonists (and 31 of 31 over three years on two seeds), with Medium at 73 of 73 in the same harness.
  - **Hunters crossing the map:** on the first Large runs, 11 of 89 colonists died. Hunters went after game
    across the map, were mauled or downed far from help, and froze. Hunters now leave marked game more than
    48 tiles from home (the neighbours' quarry excepted) and give up a chase that runs past 60.
  - **Simulation speed:** goal checks, alerts and crops walked every tree on the map, ice looked at every
    tile each hour, and animals checked every other animal for a hunter. A day-8 colony now runs at about
    40 ms per 1,000 ticks on Large (from 61) and 39 on Medium (from 50), with the same outcomes.
  - **Drawing:** a desktop window draws Large in about 3 ms a frame, or 8 ms with the whole map on screen.
  - An XL map (256×256) is planned in docs/XL_MAP.md.
- **Medium maps (128×128, called Large until the 192×192 size came) were hard to read zoomed out:** colonists showed as specks, so far out each gets a ring in their
  colour and raiders a red dot; a map smaller than the window sits in its middle, not against the left edge; and
  on a phone the colonist bar scrolls in one row (with 16 colonists it had wrapped to about 300 px). A 48-day
  Medium balance run across six seeds kept 72 of 72 colonists; a desktop window draws a Medium map in about 2 ms a
  frame at the usual zoom and about 4 ms showing all of it.
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
