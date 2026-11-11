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
  ten-year runs the test colony, which now buys truces, sees only 19–25 raids and loses nobody to them. Since this pass, about one raider in four (from day 12) is a ravager who lays waste to
  fields and livestock outside the walls instead of fighting its way in: about 1.5 crops or animals lost a raid
  in the test colony, so walls cost something, though still no lives.
- **Separations are rare** (one in six ten-year runs). Mood is lower late (yearly average about 47–52, from
  52–56); breaks no longer come in bursts after a death (no new break within a day of the last: seed 7919 went
  from 9 breaks in ten years to 2, mean mood 48.8).
- **Elders:** about one in ten new adults (founders and newcomers) is already 55–70, so most colonies know an elder
  within ten years (one of two ten-year runs had one or two elders from year 1 and three deaths of old age; the
  other's oldest reached 63).
- **Some dealings are thin:** the harness seldom buys settlers (its population is at the cap), and Meadow Kin
  goodwill still ends at 100 in some runs (though high goodwill can now be spent: friends send three days' food
  for 20 goodwill when asked). (Envoys walk in, wait about the colony, and walk off home with the
  answer; a returning expedition is seen on the road two hours out.)
- **Islands still run hungrier than valleys:** since this pass an island landing brings a week's rations and a
  fishing spot, and the colony fishes before its hut is up, so islands starve about half the hours they did
  (48 days, five seeds, Tiny: desert 4,329 to 1,983 colonist-hours, temperate 1,959 to 973, forest 1,214 to
  782, tundra 2,154 to 1,865), but that's still 5-8 times a valley's (109-367). What's left is the island
  itself: little room to farm, and the timber across the water, so building eats the hours sowing needs. The
  tundra's valleys no longer starve more than others (268 hours, from about 2,400).
- **A busy colony's simulation still slows during raids, though less.** Three raids saved from 41-day crafting
  colonies on a Medium map (saved with `SAVE_RAID=day:file`, timed with `perf.ts from=file`) ran at 67-88 ms per 1,000 ticks and now run at 48-74 (budget 60). Path searches are now about a
  third of the worst raid (allies chasing raiders across a big map); the rest is spread thin. At top speed even
  100 ms per 1,000 ticks is only about 8 ms of each second.
- **Testing:** the long-press hasn't been tried on a real iPhone. Timings are still checked by hand
  (`scripts/perf.ts`; `PERF=1` with `scripts/balance.ts` prints them by day and for raid hours), but a test now
  counts path searches, which a seeded colony makes the same every run. Saves from before version 16 can't be
  loaded (the game says so).

## Closed in this pass

- **Sixth audit: the systems the last two read least, and the interface** (two readers, each finding first seen
  failing in a test or the browser; a busy day-37 Medium colony looked at on a desktop, a tablet and a phone; 100
  scripted players over 120 days):
  - **A crash:** a maddened pack, or the great beast waking, crashed the game when everyone it could reach was in
    a pen (animals don't pass gates). It doesn't come.
  - **The colony's life:** a child born in the colony took their first steps with a short bow, and shot at
    animals with it; a tended wound kept someone off an expedition until it healed; "one baby at a time" held
    only one of a couple; the great beast's fury ran out early on a small map (its wait at the edge came off it).
  - **Saving:** stories by the fire under way at a save were counted as told on loading (the fifth audit's fix),
    so a save and a load changed the game: the scripted player who reloads every three hours saw it ten times.
    The circle carries on where it was instead.
  - **The interface:** Production's + buttons ran off a phone's dialog (a target could be lowered but not raised);
    deadlines rounded up (25 hours read "2 days"); the tile card's freshness ignored how fast food spoils there;
    Ransom was offered while the prisoner's people attacked, then refused; the only grown-up at home was offered
    to lend, then refused; traders packing up were "on their way"; an expedition past its day was "back in about
    0 days"; the Research screen never reached all learned; "1 walls and doors still to build".
  - **Left as found:** the All items list on a 360px phone starts 4px off the left edge; keyboard focus after
    Menu, Settings, Back and Resume goes to the page, not back to the Menu button (not tested); goods sold to
    traders and bought back, the island hunger and the raid speed are as above.

- **Finishing the gap list** (each found in a balance run or a timed raid, and fixed with a test):
  - **Raids were slow on big maps:** a charging raider or ally searched for a new path every 30 ticks even
    while the one it had still led to its target; it keeps it now, and the pathfinder's estimate for a cluster
    of goals costs one goal, not nine (the same paths). Three saved Medium-map raids: 67-75, 74-82 and 84-88 ms
    per 1,000 ticks to 57-60, 71-74 and 48-58.
  - **A colonist boxed in by what was built round them** (walls on two sides, a hearth and a banner on the
    others, a diagonal between walls the only gap) stood there a month, starving, with food a room away: the
    stranded check counted any open neighbour, and only ran when something was taken down.
  - **Island colonies starved by their lake:** the colony's provider waited for a roof over everyone before
    fishing, and on a desert island the hut took two weeks. See Still open for the numbers.
  - **Locked out of the beds:** four of five colonists in a desert river colony froze in a cold snap outside
    the only room, its door opening onto rock and the fifth inside with the beds; the alert for beds out of
    reach only spoke when nobody could get to them. It names who can't now. (The harness had built the door
    onto the rock; it looks first now.)
  - **The old-save tests loaded a blank map:** a save through JSON keeps each layer as {"0": …}, which loaded
    as empty; the two old saves had been tested on a world with no terrain, buildings or items.

- **Fifth audit: the less-reviewed systems, the game and drawing layer, and the interface on a phone** (two
  readers, each finding first seen failing in a test or in the browser):
  - **Pausing:** a lightning flash faded by game ticks, so when its fire paused the game the map stayed washed
    out under it (it fades over a second of real time now); a long frame (the tab back from the background) ran
    every tick owed before looking at what had happened, so the colony played on past a death or raid that
    should have stopped it; pausing snapped walking colonists back to the last whole tick.
  - **The colony's life:** stories by the fire under way when the game was saved were lost (now counted as told,
    as a concert is); a teacher good at one thing only taught their second best skill, at nothing, every other
    hour; an envoy standing in a doorway that was locked (or walled over) stayed shut in it until answered;
    traders and envoys who'd said their goodbyes stood about for up to three hours first, and no new caravan
    could come while they did.
  - **On a phone:** the weather chip (a heat wave, a storm) took a row of the top bar to itself.
  - **Checked and sound:** no listeners, scene objects or textures left behind over three new colonies; the
    map's sharpness and pixel density keep the zoom and the clicks right; settings apply when changed; 60
    random trades created or lost nothing; power and pens never go negative; every colonist field is saved.
  - **And what was left as found, since fixed:** the watch on the screen's pixel density asked for the exact
    figure, which a browser rounding a fractional density (1.1 at 110%) differently would never match, so never
    say when it changed (it's a narrow range now); at an interface size other than Normal the interface was as
    tall as the page with a phone's address bar hidden, so the build bar could sit under the bar (it's the
    height under it now); the keys followed the letter typed, so on a Russian or Greek keyboard WASD didn't pan
    and no tool letter worked (a key that isn't a Latin letter counts as the one in its place on an English
    keyboard); on a Mac a pan key held as Cmd went down panned on (letting go of Cmd lets go of every key); and
    goods sold to traders joined their wares as new, so a worn tunic or a spoiling meal came back good as new
    (only what was as good as new joins them; the rest goes in their packs).

- **Fourth audit: saving and loading, the less-reviewed systems, and the interface** (three readers, each
  finding first seen failing; a field-by-field save/load comparison every 3 hours over 20–40 days, eleven
  ten-year runs checked hourly for broken ties, caravans and births, and 100 scripted players over 30 days in
  every land: no crashes or broken rules):
  - **Saves:** another tab holding the database open blocked its upgrade and every save, load and Quit to title
    waited forever; one failed open broke saving until a reload. Both now give up with a reason and try again
    next time, and a connection a newer tab needs is let go. A concert under way when the game was saved
    vanished (not counted for the goal or the ending); it now counts as given. A slot's summary said "0
    colonists" while everyone was away on a trip; deleting a slot takes its summary in the same step.
  - **The colony's life:** illness events named colonists who were still immune and caught nothing (and spent
    the threat's turn doing it); a widow carried the old marriage's rough patch into a new one, which could end
    on its first bad morning; several couples could start expecting the same morning past the family room; a
    raid over in under ten hours shortened the breather before the next threat.
  - **The interface:** closing the pause menu (and other dialogs with a button that takes the focus) lost
    keyboard focus; Resume left a game paused before the menu opened still paused; the pause banner showed
    over the ending; a long numeric seed became 1.2e+23, which didn't give the map back; "1 more alerts", "1
    colonists", "1 days of truce left" and the like.
  - **And what was left as found, since fixed:** a patient on bed rest was put to sleep by a load, woke rested
    and went straight back to bed rest; someone mid-meal put it in storage after a load and walked back for it;
    guests at a gathering lost their place on a load and could take up work before being called back (left
    from the audit before); a leader away on a trip still lifted or soured everyone's mood (the Village screen
    now says they're away).
- **Code audit of the simulation, the world's dealings and game flow** (three readers, each confirming with a
  test; 100 scripted players for 30 days before and after, no problems seen):
  - **Endings written down wrong:** a colony wiped out by a raid was recorded as having repelled it (21 of 30
    overrun colonies in a 40-seed sample: the first raiders to find nobody standing walked off, which looked
    like their nerve breaking); a siege bought off with tribute counted as seen off; a pack that left everyone
    down was "dealt with". Each now says what happened.
  - **The ship:** a second ship couldn't be boarded once its dialog was closed (there's a Ship button on the top
    bar while it waits), a game loaded with it waiting didn't show the choice, and a ship nobody answered set
    the beacon transmitting again at once, raiders and all.
  - **The downed:** rescuers pass a nearer bed for a free hospital bed, lift someone who collapsed indoors off
    the floor, and a drafted doctor no longer keeps a downed colonist from crawling to shelter.
  - **Smaller:** a maddened pack whose nearest colonist is in a pen goes for someone it can reach; fighters
    sent against a siege arrive as it attacks; iron, ore, bricks and clay don't burn; someone away is widowed
    too; two colonists can't share a bed; forbidding a stack turns back whoever was fetching it; Q and "Stand
    down all" cover the selected colonist who can't be drafted and the drafted one who has collapsed; a dialog
    doesn't close when a slider is dragged out of it.
  - **Left as found:** guests at a party who pick up work after a load aren't called back (fixed in the fourth
    audit).
- **Map generation audited** (576 maps: every land, layout and size, 12 seeds each):
  - **Poor landings:** the colony landed on the dry tile nearest the middle, which could be wedged between rock
    and a river (7 open tiles within 6 of it, on a Tiny tundra river) or on the water's edge (70 of 576). A
    landing without room to build or with water within two tiles now moves to the best spot nearby (on an
    island map, still on the island): every landing has at least 80 open tiles round it, none is wet, and the
    furthest is 14 tiles from the middle.
  - **Big maps were speckled:** lakes, hills and woods kept a Tiny map's size, so a Large map was a scatter of
    small blobs. From Medium up they grow with the map (more slowly than it).
  - **The island's lake was a perfect ring:** its shores now bend broadly; the shallows bend with them, so the
    fords still meet them. Every colony in the sample can walk off its map. (This applies at every size, so
    Tiny and Small island maps changed too: their islands are a little larger on average, about 440 tiles of
    land on Tiny from 380.)
  - **The colony's provider chased game past the fishing spots:** a catch is surer than a chase, so the
    provider fishes first and hunts only without a spot. Island hunger fell by half or more (Tiny desert
    islands 10,600 colonist-hours to 4,200; Tiny tundra islands 7,700 to 2,400).
  - Generation takes under 100 ms on a Large map.
- **Every land and layout audited:** a 48-day balance sweep of all 24 lands × layouts at Tiny and Medium, and
  the maps looked at whole. What it found, and what changed:
  - **Tundra colonies froze, then fried:** no leather meant no parkas, and colonists met −12°C in tunics, or in
    nothing once those wore out (Medium tundra islands: 35 of 70 alive, 31 dead of cold). Tundra colonists now
    land in parkas with a tunic each for the summer, and newcomers come dressed for the season. The tundra's
    summers peaked at 28°C, and a heat wave on top killed parka-wearers by heatstroke: its climate is now
    cooler and steadier (about 2–22°C in summer, −12–8°C in winter), with no heat waves. Medium tundra islands
    now keep 56 of 63; tundra valleys and rivers lose nobody to cold or heat.
  - **Nobody fished while starving:** hunting comes late in the work order, so an island colony starved beside
    its lake. Once there's a roof over everyone and food is under a day and a half, the best hunter (two in a
    colony of seven or more) goes for food first. (Sending everyone made things worse: nothing got built.)
  - **Big maps looked like small ones:** the river kept the same width and three fords at 192 tiles, and the
    island grew with the map. On Medium and up the river is broader with a ford about every 48 tiles, and
    the lake grows more slowly, so the island stays a tight spot.
  - **The lands all looked alike:** each has its own grass now: pale and lichened on the tundra, dry in the
    desert, deep green in the forest.
- **The desert's wood ran out:** a desert colony that didn't plant a grove could burn the last of its wood and
  freeze in a later winter. Dry scrub now grows on a twentieth of the desert's open sand: it gives 5 wood when
  cut and spreads back slowly, like the trees. Three five-year desert colonies kept 180–1,200 wood throughout
  and nobody froze.
- **Elders' only care was meals:** a doctor with herbal medicine to spare (more than three doses) now eases an
  aching elder, and the aches hurt less than half as much for three days.
- **Elders gave nothing back:** some evenings an elder tells the old stories by a lit fire; whoever's free
  gathers round, both feel better for it, and children and teens listening learn something of the teller's
  best skill.

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
