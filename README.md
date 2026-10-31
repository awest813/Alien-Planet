# Colony Alpha

**An original colony simulation in the browser, built with Phaser 4, TypeScript, and React.**

Five colonists land on a procedurally generated 64×64 map. You don't control them directly: you designate work
(chop, mine, forage, build, farm, cook, haul to storage) and they decide who does what, around their own needs.
They get hungry, tired and bored, and their mood reacts to what they eat, where they sleep, how warm they are and
how nice their rooms are. Let mood drop too far for too long and a colonist will wander off in a daze.

## Playing

| Action                | Input                                                   |
| --------------------- | ------------------------------------------------------- |
| Pan                   | WASD / arrow keys, or right/middle-drag                 |
| Zoom                  | Mouse wheel                                             |
| Pause / speeds        | Space, `1` `2` `3` (or the top-bar buttons)             |
| Tools                 | Toolbar, or hotkeys shown on each button                |
| Apply a tool          | Left-drag a rectangle (walls are placed as an outline)  |
| Drop the current tool | Right-click or Esc                                      |
| Select a colonist     | Click it on the map or in the colonist list             |
| Save / load / new map | Menu button: four slots, delete, difficulty and seed    |
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
- **Phase 3 – Story:** stock 5 herbal medicine, have a doctor tend someone, see two colonists become friends,
  repel a raid, hunt an animal, equip a recurve bow, build sandbags, and reach day 12 with at least 4 colonists
  alive.

How the living simulation works:

- **Needs:** food, rest and recreation drain over time. Colonists eat when hungry (cooked meals first), sleep
  during scheduled hours or when exhausted, and seek recreation (horseshoe pin, armchair, or a walk).
- **Mood:** 50 plus the sum of current thoughts, such as "Ate a cooked meal" +4, "Ate without a table" −3,
  "Slept in the cold" −5, "Slept in a nice bedroom" +4. Low mood slows work; very low mood can cause a break.
- **Farming and production:** growing zones are sown and harvested automatically; crops grow by day, faster on
  rich soil, and not below 5°C. Stoves turn raw food into meals and crafting benches turn cotton into cloth until
  the production target is met.
- **Work:** each colonist has a 1–4 priority per work type; within a priority, work types run left to right.
- **Alerts:** the side panel warns about low food, missing beds, no shelter before nightfall, no stockpile,
  and unhappy, starving or breaking colonists.
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
  for emergencies.
- **Combat and raids:** raiders from hostile factions arrive at the map edge with bows or knives. The game
  pauses; drafted colonists shoot anything within range and line of sight, undrafted ones defend themselves at
  close range. Raiders flee once half of them fall.
- **Skills:** every skill (mining, construction, plants, cooking, crafting, medicine, combat) improves with
  practice, up to 20. Each colonist has a couple of passions (★ interested, ★★ burning) that speed learning and
  lift their mood while doing that work. Expert skills slowly rust without practice.
- **Wildlife and hunting:** deer, hares and boars roam the map and herds wander in. Mark animals with the Hunt
  tool and colonists with the Hunt work type will track and shoot them for raw meat (cookable) and leather.
  Boars often turn on their hunter, and anyone nearby will fight an enraged animal.
- **Gear and cover:** a crafting bench turns leather into recurve bows (longer range, harder hits), which
  colonists pick up from storage. Sandbags halve the chance of being hit from the side they face, for
  colonists and raiders alike.
- **Storyteller:** roughly once or twice a day it may send a raid, an illness, a wanderer who joins, a cold
  snap, a gift of supplies from the friendly Meadow Kin, or crop blight. Each event pops up as a short
  notification card and goes into the Story screen. Pick the difficulty when founding a colony: Peaceful (no
  raids), Standard, or Harsh (bigger, harder-hitting raids).

## Architecture

The simulation is completely separate from rendering. Colonists are plain data, not Phaser objects, and the whole
world is a set of flat typed arrays, so the simulation can later move into a Web Worker without changing its code.

```
src/
  data/       JSON definitions: terrain, items, features/buildings, recipes, thoughts, traits, factions,
              diseases, animals, colonist names
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
    animals.ts      Wildlife: wandering, fleeing, revenge, herds, and hunting yields
    simulation.ts   Fixed-tick loop, needs and mood, colonist AI, job system, reservations, objectives
    serialize.ts    Save format
  game/       Glue between the simulation, renderer, and UI
    controller.ts   Owns the sim, time controls, tools, UI snapshots
    save-store.ts   IndexedDB save slots
  render/     Phaser 4 scene: tilemap layers, colonist sprites, camera, input
  ui/         React management UI (colonists, objectives, log, toolbar, menus)
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
`src/sim/depth.test.ts` covers skills, cover, bows, hunting and wildlife.

`scripts/balance.ts` is a headless balance harness. An autoplayer builds a sensible colony on several seeds,
drafts colonists during raids, and reports survival, raids, illness, mood, relationships and starvation:

```
npx tsx scripts/balance.ts 20 8                # 20 days on 8 seeds, standard difficulty
npx tsx scripts/balance.ts 20 8 passive        # never draft during raids
npx tsx scripts/balance.ts 20 8 harsh          # or peaceful
npx tsx scripts/balance.ts 20 4 trace          # print the colony state whenever someone dies
```

With the current tuning (8 seeds × 20 days), a defended Standard colony keeps everyone alive, an undefended
one loses the odd colonist late on, and Harsh costs around one colonist in eight, with no colony wiped out.
First friendships appear around day 6–7, with a few rivalries and couples over 20 days.

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
