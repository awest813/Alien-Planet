# Colony Alpha

**An original colony simulation in the browser, built with Phaser 4, TypeScript, and React.**

A handful of colonists land on a procedurally generated map: three on a small 64×64 valley (room for six), four on a
medium 96×96 one (room for nine) or five on a large 128×128 frontier (room for twelve). You don't control them directly: you designate work
(chop, mine, forage, build, farm, cook, haul to storage) and they decide who does what, around their own needs.
They get hungry, tired and bored, and their mood reacts to what they eat, where they sleep, how warm they are and
how nice their rooms are. Let mood drop too far for too long and a colonist will wander off in a daze.

## Playing

The game opens on a title screen: **Continue** picks up your most recent save, **New colony** asks for a
difficulty, map size and seed, and **Load game**, **Settings** and **How to play** are there too. In a game,
Esc (once there's no tool or selection to drop) or the Menu button opens the pause menu: resume, save or
load, start a new colony, settings, help, or quit to the title (which autosaves). The game also autosaves
every dawn and whenever you leave the page, so a closed tab doesn't lose the colony. When everyone has
died, a summary shows how the colony fared.

**Settings** (remembered in the browser): autosave, pausing on raids and on deaths or collapses, interface
size, how long notifications stay, camera speed, name labels, the minimap, a list of controls, and a way to
see the welcome help again.

| Action                | Input                                                   |
| --------------------- | ------------------------------------------------------- |
| Pan                   | WASD / arrow keys, or right/middle-drag                 |
| Zoom                  | Mouse wheel                                             |
| Pause / speeds        | Space, `1` `2` `3` (or the top-bar buttons)             |
| Tools                 | Toolbar, or hotkeys shown on each button                |
| Apply a tool          | Left-drag a rectangle (walls are placed as an outline)  |
| Drop the current tool | Right-click or Esc                                      |
| Pause menu            | Esc (with no tool or selection), or the Menu button     |
| Next colonist         | Tab                                                     |
| Select a colonist     | Click it on the map or in the colonist list             |
| Save / load / new map | Pause menu: four slots, delete, difficulty, size, seed  |
| Work priorities       | Work button: click a cell to cycle 1 → 4 → off          |
| Schedules             | Schedule button: pick a brush and paint hours           |
| Draft for combat      | Q (selected colonist, or everyone), or the Draft button |
| Move drafted colonist | Select them, then right-click a tile                    |
| Hunt                  | V, then drag over animals                               |
| Production targets    | Production button: "keep N meals / cloth in stock"      |

Objectives:

- **Phase 1 – Shelter:** chop 40 wood, designate a stockpile, haul 30 items, build an enclosed shelter, build a
  bed, and survive the first night with everyone indoors.
- **Phase 2 – Living:** create a growing zone, harvest 24 potatoes, cook 5 meals at a stove, build a recreation
  spot, heat a bedroom with a campfire, and weave cloth for an armchair.
- **Phase 3 – Story:** harvest 5 herbal medicine, have a doctor tend someone, see two colonists become friends,
  repel a raid, hunt an animal, equip a recurve bow, build sandbags, and reach day 12 with at least 4 colonists
  alive.
- **Phase 4 – Seasons:** build a research bench and pick a project, complete three research projects, research
  hearths and build a stone hearth, and survive your first winter.

How the living simulation works:

- **Needs:** food, rest and recreation drain over time. Colonists eat when hungry (cooked meals first), sleep
  during scheduled hours or when exhausted, and seek recreation (horseshoe pin, armchair, or a walk).
- **Mood:** 50 plus the sum of current thoughts, such as "Ate a cooked meal" +4, "Ate without a table" −3,
  "Slept in the cold" −5, "Slept in a nice bedroom" +4. Low mood slows work; very low mood can cause a break.
- **Farming and production:** growing zones are sown and harvested automatically; crops grow by day, faster on
  rich soil, and not below 5°C. Stoves turn raw food into meals and crafting benches turn cotton into cloth until
  the production target is met.
- **Work:** each colonist has a 1–4 priority per work type; within a priority, work types run left to right. The
  Work screen shows each colonist's skill and passions in every cell (right-click lowers a priority). One
  exception: while blueprints wait on granite and not on wood, mining comes before plant cutting, so a big chop
  order doesn't hold up the stove.
- **Alerts and goals:** the side panel keeps alerts in view (low food, missing beds, no shelter before nightfall,
  hurt, starving or breaking colonists, fires, raids); clicking one takes the camera to whoever or wherever it's
  about. Below them, the next goal says how to reach it and its button picks the right tool or opens the right
  screen; every goal in the list is clickable the same way.
- **Top bar:** days of food at the current headcount, icons for key materials, and every item under "All items".
  Hovering a build tool shows what it does, what it costs and any research it needs.
- **Rooms and temperature:** enclosed rooms get a role (bedroom, barracks, kitchen, …) and an impressiveness
  score from furniture beauty and size. Outdoor temperature follows a day/night cycle; rooms drift towards it
  and campfires heat them.

How the storytelling layer works:

- **Traits and relationships:** every colonist has two traits (hard worker, optimist, glutton, tough,
  sharpshooter, abrasive, …). Nearby colonists chat, have deep talks, or trade insults, which moves their
  opinions of each other; friends, rivals and lovers emerge and affect mood.
- **Health:** wounds bleed until a doctor tends them (better with herbal medicine from healroot). Too much pain
  or blood loss and a colonist collapses; too much and they die, and everyone grieves. Marsh fever is a race
  between severity and immunity that bed rest and tending tilt in the patient's favour. Doctors get out of bed
  for emergencies, and bring food to colonists too hurt to get up.
- **Combat and raids:** raiders from hostile factions arrive at the map edge. The Rust Wardens favour bows, the
  Ashen Howlers clubs and spears; later raids bring better bows, crossbows and armor. The game pauses. Archers on
  both sides look for firing positions behind cover, keep to their range and are rattled (suppressed: worse aim)
  by shots landing close; melee fighters charge. Badly wounded raiders may break and run, and the raid flees once
  most of them are down or running. Undrafted colonists run indoors when raiders come close, and fight back only
  when cornered. Walling yourself in doesn't stop them: raiders who can't reach anyone smash through the nearest
  wall or door (clubs and spears break walls faster than bows).
- **Drafted colonists:** pick a stance in the inspector: Take cover (the default: slip into nearby cover with a
  clear shot), Hold (stay exactly where sent) or Charge (close in; chargers prefer melee weapons when equipping).
  Right-click the map to send the selected colonist somewhere (they get there before stopping to shoot), or
  right-click a raider to have the selected colonist, or everyone drafted, concentrate fire on them.
- **Animal husbandry:** mark wild animals with the Tame tool; colonists with the Handle work type (and the
  Animals skill) calm them and try to win them over, harder for wilder animals, and a boar may lash out.
  Tame animals stay near the colony, pairs breed most mornings, and each morning tame deer give milk, muskoxen
  shed wool (spun into cloth at the crafting bench) and grouse lay eggs (cooked like meat). Tame boars and
  wolves bite raiders who come close. Mark a tame animal for hunting to slaughter it for meat and leather.
- **Clothing and exposure:** colonists start in tunics. Research Tailoring to make tunics from cloth and warm
  parkas from leather at the crafting bench; clothes get a quality tier (Poor to Masterwork) from the
  crafter's skill, insulate more the better they're made, and wear out over weeks. Colonists change into
  whatever in storage suits the weather best. Cold or heat beyond what they're wearing builds into
  hypothermia or heatstroke: they go and warm up (or cool off), sleepers wake rather than freeze, and doctors
  carry anyone who collapses somewhere safe. Left too long, exposure kills.
- **Better food, worse food:** a cook with skill 6 or more can make fine meals (a mood boost) from both meat
  or fish and vegetables. Meals carry their cook's skill: poorly cooked meals, and raw meat or fish, sometimes
  cause food poisoning, which slows a colonist down for half a day.
- **Production chains:** recipes can take several ingredients, which the crafter gathers one after another. A
  stonecutter's table cuts granite chunks into blocks for sturdy, slightly prettier block walls, and once
  Tailoring is researched, a crafting bench can mend worn clothes with cloth (Production lets you pause mending).
  Recurve bows get a quality tier too: better bows hit harder, and colonists swap for a clearly better one.
- **Skills:** every skill (mining, construction, plants, cooking, crafting, medicine, combat) improves with
  practice, up to 20. Each colonist has a couple of passions (★ interested, ★★ burning) that speed learning and
  lift their mood while doing that work. Expert skills slowly rust without practice.
- **Wildlife and hunting:** deer, hares, boars, muskoxen, grouse, foxes and wolves roam the map, and herds
  wander in, each species in its own numbers. Mark animals with the Hunt tool and colonists with the Hunt work
  type will track and shoot them for raw meat (cookable) and leather. Boars and wolves often turn on their
  hunter, and anyone nearby will fight an enraged animal. Wolves and foxes hunt the smaller animals but leave
  people alone: a hungry predator runs down a deer, hare or grouse, the pack shares the kill, and it
  leaves raw meat behind. Wildlife comes and goes: when the map gets crowded the herd that has been around
  longest moves on, predators with nothing left to hunt leave, and a maddened pack whose fury is spent goes
  back where it came from. A hunted-out valley slowly refills: while wildlife is under half the room there is, a
  few grazers sometimes wander in at dawn (most often in spring, rarely in winter). Wounded animals mend slowly.
- **Wild plants:** outside winter, trees and berry bushes slowly spread onto open grass and soil beside their own
  kind (not in zones, under roofs or floors, on items or plans, or near the colony), until they cover about as
  much of the map as at the start. A forest cut down comes back over seasons, not days.
- **Weapons, armor and defenses:** one set of weapons for everyone, each with its own reach, rate, accuracy,
  drop-off and armor piercing: fists, knife, club, spear, short bow, recurve bow, longbow (Longbows research) and
  crossbow (Crossbows research). Leather and scale armor (Armor and Scale armor research) turn aside a share of
  every blow, wear down as they do it, and scale armor slows its wearer. Colonists pick up clearly better weapons
  and armor from storage, and fallen raiders drop some of their kit. Sandbags and embrasures (stone wall slots you
  can shoot through but not walk through) cut the chance of being hit from the side they face; spike traps
  (Traps research) wound the first raider to step on them and go back on the build list.
- **Seasons:** a year is four six-day seasons, starting in early spring. Temperatures follow the year (warm
  summers, freezing winter nights). Crops don't grow in winter and hard frost kills anything left in the field,
  so plant enough in spring and summer and harvest before winter.
- **Research:** build a research bench, pick a project in the Research screen, and colonists with the Research
  work type study it (training the Intellectual skill). Seventeen projects unlock the recurve bow, sandbags, the
  stone hearth, the fine bed, tailoring and all the electrical tech below, or improve insulation, crop growth and
  doctoring.
- **Power:** the colony shares one grid. Wood-fired generators (kept fuelled by haulers) and solar panels (daytime
  only, weaker in winter) supply it; batteries store the surplus. If demand outstrips supply and storage,
  everything electric switches off. Generators idle to save fuel while the batteries are full and nothing
  else needs them, and haulers refuel a generator that's running low before anything else.
- **Climate control and cold storage:** electric heaters, air conditioners (cool to 20°C) and freezer units
  (chill a sealed room to −6°C). Food rots over days — faster when warm, not at all when frozen or in a running
  icebox — so a freezer room or iceboxes keep the harvest through winter. Haulers move perishable food into
  either automatically.
- **Floors and roofs:** wood floors, stone tiles (from granite blocks) and carpet (from cloth, after Tailoring)
  are laid under furniture without moving it. Floors are quicker to walk on than bare ground and add to a room's
  beauty, and nothing grows on them. Enclosed rooms are roofed already; build a roof over an open area to make a
  shelter from the rain (it keeps colonists dry and lightning off). Crops need the sun, so a roof can't go over a
  crop or a growing zone, and a growing zone can't go under a roof; a walled greenhouse with sun lamps needs no roof. Roofs are drawn only
  while the Roof, Deconstruct or Cancel tool is picked; the tile inspector says whether a tile is roofed. Deconstructing a
  tile takes down the building first, then the roof, then the floor.
- **Tool kits:** a crafting bench turns wood and granite chunks into tool kits. Anyone who mines, builds, grows or
  cuts plants picks one up from storage and works 30% faster at those jobs (more with a well-made kit, less with
  a poor one) until it wears out after about 80 hours of use; the Production screen keeps two spares in stock.
- **Weather:** clear skies, rain, storms, fog, summer droughts and winter snow come and go in spells (shown in the
  top bar). Rain soaks anyone outside, who feel the cold more and grumble about it; rain helps crops and
  droughts halve their growth; fog and rain spoil aim for both sides. Below freezing, rain falls as snow.
- **Fire:** lightning in storms can set trees, crops and wooden buildings alight near the colony. Fire spreads to
  anything flammable next to it (faster in a drought); rain stops it spreading and soon puts it out. Whatever
  burns through is destroyed along with any items on the tile, and a lost building is marked for rebuilding (as
  are walls raiders break through). Colonists who haul or build drop their work, or wake up, to beat out fires
  near home. The lightning flash can be turned off in Settings.
- **Trade and factions:** now and then a caravan from the friendly Meadow Kin walks in and stays for most of a
  day. Open Trade in the top bar to buy their goods and sell anything in your stockpiles for silver (the colony
  lands with 100). Prices depend on goodwill, which grows with every sizeable deal and brings caravans more
  often; the Story screen lists every faction and where you stand with it.
- **Water:** shallow water is slow to wade through and leaves colonists soaked (a small mood hit); deep water
  is impassable until you build a bridge over it. Fishing spots on the shore let hunters catch raw fish while
  the colony is short of food. In hard frost the shallows freeze from the shore inwards and can be walked
  across; frozen water can still be fished through the ice, at half the pace, and the ice melts again when it
  warms up.
- **Sun lamps:** crops beneath them grow day and night, all year, so a heated greenhouse can farm in winter.
- **Storyteller:** roughly once or twice a day it may send something. Threats (more often on Harsh, rarer on
  Peaceful): raids, marsh fever, cold snaps, summer heat waves, crop blight, eclipses that darken the sky and
  solar panels for a few hours, and packs of maddened boars or wolves (more likely at night) that hunt colonists down one after another. Good
  fortune: wanderers and wounded refugees asking to join, herds, trade caravans and gifts from the friendly Meadow
  Kin, meteorites that scatter silver and stone (and may start a fire), auroras that lift everyone's mood, a
  colonist struck by inspiration (40% faster work for a day), and bumper crops. Each event pops up as a short
  notification card and goes into the Story screen. After any threat there's a breather before the next (a day
  on Standard, a day and a half on Peaceful, half a day on Harsh), and no new threat comes while half the
  colony is down or a maddened pack is still loose. Gifts lean towards what the colony is short of: food when
  the stores are low, medicine when someone is hurt or sick, wood when the pile is nearly gone. Pick the difficulty when founding a colony: Peaceful (no
  raids or manhunters), Standard, or Harsh (bigger, harder-hitting raids).

## Architecture

The simulation is completely separate from rendering. Colonists are plain data, not Phaser objects, and the whole
world is a set of flat typed arrays, so the simulation can later move into a Web Worker without changing its code.

```
src/
  data/       JSON definitions: terrain, items, features/buildings, recipes, thoughts, traits, factions,
              diseases, animals, research projects, colonist names
  sim/        Pure TypeScript simulation (no Phaser, no DOM)
    world.ts        Tile layers as typed arrays, item stacks, dirty-tile tracking
    worldgen.ts     Seeded fractal-noise terrain, rock, trees, berry bushes
    pathfinding.ts  A* with 8-way movement and reusable buffers
    regions.ts      Connectivity regions (O(1) reachability) and room detection
    climate.ts      Outdoor temperature, room heating, room roles and impressiveness
    social.ts       Traits, opinions, conversations, friends, rivals and lovers
    health.ts       Injuries, bleeding, healing, disease, tending, collapse and death
    combat.ts       Raiders, line of sight, ranged and melee attacks, morale
    storyteller.ts  Random events with cooldowns and difficulty
    skills.ts       Skill experience, passions, level-ups and rust
    seasons.ts      The calendar and seasonal temperature
    research.ts     Research state, availability and unlocks
    power.ts        The colony power grid: generators, solar, batteries
    animals.ts      Wildlife: wandering, fleeing, predators, revenge, herds, produce and hunting yields
    plants.ts       Trees and berry bushes spreading back over open ground
    simulation.ts   Fixed-tick loop, needs and mood, colonist AI, job system, reservations, objectives
    serialize.ts    Save format
  game/       Glue between the simulation, renderer, and UI
    controller.ts   Owns the sim, time controls, tools, UI snapshots
    save-store.ts   IndexedDB save slots
  render/     Phaser 4 scene: tilemap layers, colonist sprites, camera, input
  ui/         React management UI
    App.tsx         Layout: top bar, colonist bar, inspector, side panel, architect menu
    hud.tsx         The always-on HUD components
    screens.tsx     Dialogs: work, schedule, production, research, story, help, menu
```

- **Fixed-step simulation:** 20 ticks per second at 1× speed, driven from real elapsed time.
- **Commands:** every player action goes through `Simulation.apply(command)`, which is the seam for a Worker.
- **Jobs:** idle colonists first look after urgent needs, then walk their work priorities, pick the nearest
  reachable target for each work type, and reserve it so two colonists never take the same job.
- **Rendering:** the scene reads only tiles the simulation marked dirty, so a frame does almost no work when
  nothing changes. All art is drawn procedurally at startup.
- **Saves:** typed arrays are stored directly in IndexedDB. Jobs aren't saved; colonists pick new work on load.

In development the controller is exposed as `window.colony` for poking at the simulation from the console.

### Tests and balance

The simulation runs headlessly, so it is tested directly with [Vitest](https://vitest.dev/):

```
npm test
```

`src/sim/simulation.test.ts` covers world generation, pathfinding, room detection, item conservation, construction,
farming and cooking, heating, save/load, and regression tests for fixed AI bugs. `src/sim/phase3.test.ts`
covers traits, line of sight, raids, bleeding and tending, disease, relationships, and events, and
`src/sim/depth.test.ts` covers skills, cover, bows, hunting and wildlife, and `src/sim/seasons.test.ts` covers
the calendar, winter cold, frost and research. `src/sim/tech.test.ts` covers power, spoilage, cold storage and
sun lamps, `src/sim/water.test.ts` covers bridges, fishing, ice, wading and battery charging, and
`src/sim/playtest.test.ts` covers fixes from persona playtests (feeding the downed, raiders breaching walls,
idle generators), `src/sim/needs.test.ts` covers clothing, exposure, fine meals, food poisoning, multi-ingredient
crafting, stonecutting, mending and saves, `src/sim/building.test.ts` covers floors, roofs and tool kits,
`src/sim/husbandry.test.ts` covers taming, herding, breeding, milk and
guard animals, `src/sim/wildlife.test.ts` covers the species, herd sizes, predators, wool, eggs and manhunter
wolves, `src/sim/weather.test.ts` covers weather, soaking, lightning, fire and firefighting, and
`src/sim/trade.test.ts` covers caravans, buying and selling, goodwill and saving a visit, and
`src/sim/combat.test.ts` covers weapons, armor, raider loadouts and tactics, suppression, embrasures, traps,
focus fire, taking cover and sheltering. `src/sim/flow.balance.test.ts` covers the game-flow fixes: mining
before chopping when builders wait on stone, grazers returning to a hunted-out valley, and wild plants regrowing.

`scripts/balance.ts` is a headless balance harness. An autoplayer builds a sensible colony on several seeds,
puts its best researcher on research, drafts colonists during raids, and reports survival, raids, illness, mood, relationships and starvation (including what starving colonists were doing instead of eating):

```
npx tsx scripts/balance.ts 26 8                # 26 days (through winter) on 8 seeds, standard difficulty
npx tsx scripts/balance.ts 20 8 passive        # never draft during raids
npx tsx scripts/balance.ts 20 8 harsh          # or peaceful
npx tsx scripts/balance.ts 20 4 trace          # print the colony state whenever someone dies
npx tsx scripts/balance.ts 30 6 size=128       # on a Large map (size=96 for Medium)
npx tsx scripts/balance.ts 30 1 trace seed=7919 # replay one colony (DEBUG=1 adds rooms, bills, research)
npx tsx scripts/balance.ts 48 6 flow           # day-by-day food, materials, crops and wildlife, averaged
```

With the current tuning (8 seeds × 26 days, through the first winter), a Standard colony that farms enough
keeps everyone alive but goes hungry for a while late in winter; Harsh costs around one colonist in six, with
no colony wiped out. First friendships appear around day 6–7, with a few rivalries and couples.

## Roadmap

- **Phase 1 – The playable colony** (done): procedural terrain, 5 autonomous colonists, mining, chopping,
  hauling, building, stockpiles, time controls, save/load.
- **Phase 2 – The living simulation** (done): hunger, sleep, recreation and moods; farming, cooking and crafting; job
  priorities and work schedules; rooms, furniture and temperature.
- **Phase 3 – The storytelling game** (done): relationships and traits; injuries, medicine and disease; combat, raids
  and factions; dynamic events.

## 🛠️ Installation <a id="installation"></a>

Install the dependencies with:

```
npm install
```

## 💾 Development <a id="development"></a>

Start the development server with:

```
npm run dev
```

Once the game is running, open your browser and go to:

```
localhost:3000
```

Any changes you make will automatically reload the development server.

## 📱 Mobile deployment <a id="mobile-deployment"></a>

If you use this template for building a new game, make sure the game is deployed with the correct name, version, and app icon:

- Confirm everything is correct under `package.json`. The fields `name` and `version` are the most important to verify.
- Make sure `capacitor.config.ts` has the correct `appId` and `appName`.
- Add an app icon to `resources/icon.png`.

[Capacitor by Ionic](https://capacitorjs.com/) is used for mobile deployment and depending on which mobile operating system you wish to deploy to, you can create the [Xcode](https://developer.apple.com/xcode/) or [Android Studio](https://developer.android.com/studio/) project with:

```
npx cap add ios
npx cap add android
```

You can open the project to make any changes directly in [Xcode](https://developer.apple.com/xcode/) or [Android Studio](https://developer.android.com/studio/):

```
npx cap open ios
npx cap open android
```

To deploy to either mobile operating system you can run:

```
npm run deploy:ios
npm run deploy:android
```

## 🌐 Web deployment <a id="web-deployment"></a>

To deploy the game to a web server you can run:

```
npm run build
```

The build output will be placed in the `dist/` directory and can be uploaded to a web server.
