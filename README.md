# Colony Alpha

**An original colony simulation in the browser, built with Phaser 4, TypeScript, and React.**

A handful of colonists land on a procedurally generated map: three on a tiny 64×64 valley (room for six), four on a
small 96×96 one (room for nine), five on a medium 128×128 frontier (room for twelve) or six on a large 192×192
country (room for fifteen), near the middle on a spot with room to build and dry feet. You don't control them
directly: you designate work
(chop, mine, forage, build, farm, cook, haul to storage) and they decide who does what, around their own needs.
They get hungry, tired and bored, and their mood reacts to what they eat, where they sleep, how warm they are and
how nice their rooms are. Let mood drop too far for too long and a colonist will wander off in a daze.

## Playing

The game opens on a title screen: **Continue** picks up your most recent save, **New colony** asks for a
difficulty, map size, land (temperate, tundra, desert or forest), lie of the land (an open valley, a river
crossing it, or an island in a lake) and seed, and **Load game**, **Settings** and **How to play** are there too. In a game,
Esc (once there's no tool or selection to drop) or the Menu button opens the pause menu: resume, save or
load, start a new colony, settings, help, or quit to the title (which autosaves). The game also autosaves
every dawn and whenever you leave the page, so a closed tab doesn't lose the colony. When everyone has
died, a summary shows how the colony fared.

**Settings** (remembered in the browser): autosave, pausing on raids and on deaths or collapses, sound (off by
default, with volume sliders for music and for ambience and alerts), day and night lighting, interface
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
- **Phase 5 – Prosperity:** power, cold storage, taming, fine meals, parkas, a full colony, a second winter, and the
  culture goals (recreation, art, music, gatherings).
- **Phase 6 – Legacy:** the long game. Research the signal beacon, build it and keep it powered for five days
  while raiders, drawn by the signal, come for it. A ship answers and lands beside the beacon. Board it and the
  colony's story ends on your terms, with a summary of what it made of its time; or stay, and signal again
  whenever you like.
- **Phase 7 – Generations:** goals the colony's own story brings, for those who stay: raise a child born here to
  adulthood, see a third generation, a colonist reach 65, a siege seen off, the great beast brought down, the
  Meadow Kin fighting alongside, and a cavern broken into below.
- **Phase 8 – Mastery:** what a long-settled colony can do: a harvest brought in during winter, steel, a
  masterwork craft, a thief brought down, a raid seen off with nobody left down, 60,000 silver in wealth, every
  research project learned, and ten years in the valley.

How the living simulation works:

- **Lands:** a tundra start is colder, rockier and snowier, with muskoxen, cool summers and no heat waves; its
  colonists land in parkas, with a tunic each for the summer. A desert has little wood or water, hot afternoons
  and cold nights, and dry scrub on the open sand that gives a little firewood when cut and slowly grows back; a forest is thick with trees and berry bushes and wetter. Each has its own grass: pale on the
  tundra, dry in the desert, deep green in the forest. A river or a lake around an island can cut the valley up,
  crossed at shallow fords; on a big map the river is broader with more fords, and the island stays a tight spot
  with more mainland across the water.
- **Threats that vary:** raids are sized to a fair fight against the colony's able fighters (about a third more
  than can fight back, and a little more for a rich colony). Raiders who can't get in break walls and doors, and
  sappers dig through rock. Thieves slip in to grab the richest stack from the stores and run, more often the
  richer the colony; bring one down and they drop it. While the signal beacon transmits, a third of each raid
  goes straight for it. From the second year, raids against wooden walls bring firebrands, who set walls and doors alight (once each,
  and not in winter or wet weather).
  Vermin spoil food left on the stockpile floor, mostly in winter (shelves, iceboxes and
  frozen stores are safe).
- **Late research:** later projects need a building standing to study (a smelter for steel, a kiln for glass)
  and materials from storage to finish: steelmaking, glassmaking (daylight for a field walled in as a room, so
  a warm greenhouse grows in winter), double glazing, reinforced walls, barbed traps, antiseptics, plant breeding,
  prosthetics and precision tools. The beacon needs engineering first. After engineering and surgery, Further
  study can be taken up round after round, each dearer, each making all work a little faster (up to ten rounds).
- **More disease:** marsh fever, the winter cough, the grey flu (winter, catching, can kill) and the rare
  shaking sickness (passes by touch, deadly untended). Every illness is harder on the old.
- **Family life:** colonists who dislike each other argue, and bitter rivals can come to blows (someone breaks it
  up); a marriage that sours for long enough can end. About one in ten newcomers is already 55–70. Children have lessons at a lesson board from the most
  skilled adult, play together, and come of age remembering a hard or a happy childhood. From 65, elders may
  get stiff joints, a sore back, failing eyes or frailty; the frail have their meals brought, and elders can
  retire. Some evenings an elder tells the old stories by a lit fire: whoever's free gathers round, both feel
  better for it, and the children and teens listening pick up something of the teller's best skill. A doctor
  with herbal medicine to spare (more than three doses) eases an aching elder: the old aches hurt less than
  half as much for three days. Grief for a spouse, child, parent or friend lasts weeks and returns on the anniversary; the colony
  expects more of its leader as the years pass, and the leader and elders want rooms of their own.
- **The wider world:** the raiders have goodwill too: releasing or ransoming their people softens them,
  starving or executing them hardens them (an execution also weighs on every colonist for days), and once they're soft enough they'll take a truce. A second friendly faction,
  the Hollowstone Clans, trades iron, tools and stone and quarrels with the Meadow Kin: back one and the other
  takes it badly. Envoys walk in to offer alliances; an ally's fighters come to raids more often, and when they're raided
  they ask for a colonist or goods, and refusing ends the alliance. Send one to three colonists on an expedition
  to a neighbour's settlement (to trade) or the ruins (to salvage); they come back days later with goods,
  maybe a recruit, maybe hurt. Silver buys expedition supplies and settlers from the Meadow Kin. A
  friendly faction that thinks well of the colony (goodwill 50) sends three days' food for everyone when asked, for
  20 goodwill, at most every ten days.
- **Pens and hunting:** fence a pen with a gate, put in a feeding trough (haulers fill it with hay from the grain fields first, then potatoes, berries or grain), and
  tame animals stay there; fed pairs breed in any season. A village policy can limit hunting to the surplus,
  leaving a breeding pair of each kind, and the Meadow Kin take it badly if the valley is hunted out.

- **Needs:** food, rest and recreation drain over time. Colonists eat when hungry (cooked meals first) and sleep
  during scheduled hours or when exhausted. A starving colonist (food at zero) works at 80% and walks at 90% until
  they eat.
- **Recreation:** colonists relax in an armchair, pitch horseshoes, play chess (two players) or cards (up to four),
  stargaze through a telescope on clear nights (Optics research), or go for a walk, which does more good among
  trees and water. Each has a kind (relaxing, games, social, outdoors; music and art come later). Doing the same
  kind over and over is worth less each time, so colonists move between them, and a good mix gives "Varied
  recreation" while one kind on its own gets old. Players chat over a game, which builds friendships; rivals won't
  sit down together. The inspector shows what a colonist has had lately.
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
- **Gatherings:** a cheerful colonist sometimes throws a party on an evening; the year has three festivals
  (Planting Day, the harvest festival, where everyone eats from the stores, and the midwinter bonfire), which you
  can skip from the Story screen; devoted lovers marry in the colony's finest room, and stay married; and the fallen
  are laid to rest at a funeral once there's a grave for them, with a memorial stone, carved by an artist,
  keeping their names. Off-duty colonists come to parties and festivals; everyone not dealing with an emergency
  comes to weddings and funerals. Upcoming gatherings show in the side panel.
- **Music:** build a drum, flute, lute or (after Instruments research) a harp. Colonists play for fun and train
  Artistic, and everyone in earshot enjoys it, more so from a good player. On an evening, a player with Artistic 6+
  may give a concert: off-duty colonists gather round to listen and chat. With sound on, you hear every
  instrument, each with a tune of its own; a beginner's playing is a little off.
- **Art and decor:** plan a small, large or grand sculpture (Art & decor tab) and a colonist with Art work carves
  it in place. Their Artistic skill sets the quality, from poor to masterwork, and so how beautiful it is. Every
  piece is titled after a moment from the colony's story ("Ada and Bram", "The Long Winter", "In Memory of Wren").
  Flower pots (faded in winter) and banners need no artist. Colonists feel beauty within a couple of tiles
  ("Pleasant" or "Beautiful surroundings"), a bare room drags a little, sculptures are art recreation, and a room
  that's mostly art is a gallery. Visiting traders buy sculptures where they stand (memorials excepted): the finer
  the piece and the better they think of the colony, the more silver it fetches. You can tell a piece's quality
  at a glance: poor work is cracked, excellent work trimmed in silver, a masterwork in gold.
- **Cleaning:** wounds leave blood, mining and demolition leave rubble, and feet track dirt onto floors. Mess
  makes a room and its surroundings uglier until someone with Cleaning work scrubs it away; outdoors, the
  weather wears it off in time. A dirty kitchen cooks worse, riskier meals, a dirty sickroom slows healing,
  and a filthy room sours the mood.
- **Prisoners:** raiders downed by pain, and some struck down harder, fall wounded instead of dying. Build a prisoner bed, drag Capture over them, and
  colonists with Warden work bring them in, feed them and talk them round until they join the colony, bringing
  their fighting skill. Left lying they die within a day; a starved prisoner dies too, and one can be released
  from the Prisoners screen.
- **Bodies:** wounds land on body parts. Left untended or tended in filth, an open wound can turn infected and
  worsen until a doctor treats it (herbal medicine helps most). A bad wound may leave a limp, a stiff hand, a lost
  eye or an aching scar. Hospital beds heal faster and keep infection down; a room of them is an infirmary.
- **Minds:** a colonist pushed too far breaks in their own way: a daze, a sulk in bed, a food binge, or a rage
  that smashes some furniture (gluttons binge, the abrasive rage, the kind never do). Inspirations vary too: faster
  work, a creative spark for one great sculpture, a knack for taming, a mood for teaching the children. Now and
  then a skilled artist is seized by a vision: bring the materials in time and they carve a legendary sculpture;
  fail them and they snap.
- **Families:** colonists have ages and backstories. Married couples have children: babies are carried by a
  parent, then grow up through childhood (learning by watching the adults work) and their teens (light work) into
  full colonists who take after their parents. Grown-ups age three years a year, so over a long game the
  founders slow down, grow old and die of old age while their children raise families of their own. Nobody
  courts family within two generations (cousins, aunts, uncles and grandparents included). As the colony
  settles in, expectations rise: what pleased at the landing is taken for granted years later.
- **The village:** once there are three adults, the colony chooses a leader by vote, each backing whoever they
  think best of (kind natures win votes, abrasive ones lose them), and votes again each season or when the
  leader dies. A cheerful leader lifts everyone; a miserable one drags them down. The Village screen sets the
  policies: frugal or generous rations, short or long working hours, and a day of rest one day in six. Each
  pleases some and annoys others (gluttons hate frugal rations, the lazy hate long hours, hard workers don't mind).
  On a day of rest the sick are still tended, prisoners fed and fires kept going, and when the stores are nearly
  empty the day off is called off.
- **Great threats and the chronicle:** from the second year, the great beast of the hills wakes once a year,
  named and larger than life, and comes for the colony; drive it off and it returns bigger, bring it down
  and it's gone for good. In the cold months a catching cough spreads to anyone close by. The Story screen
  keeps the colony's chronicle: births and deaths, marriages, battles, great works, leaders and
  milestones, year by year, for as long as the colony lasts, with graphs of the colonists, their mood, the
  colony's wealth and its days of food over time. The ☰ at the end of the colonist bar shows everyone at a
  glance: mood, needs, health, what they're doing and what they're best at.
- **Into the rock:** research Deep mining (after Smelting) and sink a mine shaft. Miners with nothing else to do
  dig it deeper, a stretch at a time, for stone, iron ore and silver; the deeper it goes the richer the rock and
  the harder the digging. Past twenty metres something may break through from below: cave crawlers pour up out
  of the shaft. Beat them off and the cavern beyond makes the shaft richer still, and quiet for another thirty
  metres or so; dig on and it happens again. Cancel the shaft to stop the digging.
- **Neighbours:** every week or so the Meadow Kin ask a favour: some goods from your stockpiles, or a great boar
  hunted down, within a few days. Doing it pays silver (sometimes a new colonist) and wins goodwill; turning it
  down or letting it lapse costs some. Goodwill means better prices, more caravans and more gifts of supplies;
  fall below zero and they stop dealing with you until hard feelings fade. Send gifts of silver to win them
  round, pay raiders tribute for twelve days' peace, or (at goodwill 30 or more) hire the Meadow Kin's fighters to
  come to every raid and siege for twelve days, all from the Factions screen.
- **Food and materials:** grow grain, mill it into flour and bake bread that keeps a month; hang meat, fish and
  berries on drying racks to keep them for months without power. Dig clay from the riverbanks and fire it into
  bricks in a kiln, and mine the rusty iron veins in the rock for a smelter's iron: tool kits, swords and mail.
- **Storage and fuel:** click a stockpile to choose what it takes (food, materials, gear, medicine) and its priority;
  haulers fill higher priority stockpiles first and move things up to them. Forbid items to keep everyone's hands
  off them. Shelves hold three stacks on one tile. Lock a door from its tile card to keep everyone out (or in);
  raiders have to break through. Campfires, hearths and torches burn wood that haulers bring, so keep a woodpile
  for winter.
- **Rooms and temperature:** enclosed rooms get a role (bedroom, barracks, kitchen, …) and an impressiveness
  score from furniture beauty and size. Outdoor temperature follows a day/night cycle; rooms drift towards it
  and campfires heat them. A fire in the open warms the ground within two tiles, so colonists caught without
  shelter huddle by it.

How the storytelling layer works:

- **Traits and relationships:** every colonist has two traits (hard worker, optimist, glutton, tough,
  sharpshooter, abrasive, …). Nearby colonists chat, have deep talks, or trade insults, which moves their
  opinions of each other; friends, rivals and lovers emerge and affect mood. Feelings fade a little each day,
  so friendships need keeping up and grudges wear off: relationships keep changing over the years.
- **Health:** wounds bleed until a doctor tends them (better with herbal medicine from healroot). Too much pain
  or blood loss and a colonist collapses; too much and they die, and everyone grieves. Marsh fever is a race
  between severity and immunity that bed rest and tending tilt in the patient's favour. Doctors get out of bed
  for emergencies, and bring food to colonists too hurt to get up (a starving patient before a wound that isn't
  bleeding). With nobody on their feet to help, a downed colonist crawls out of the cold and, if they're going
  hungry, to the nearest food.
- **Combat and raids:** raiders from hostile factions arrive at the map edge, and the warning says when they'll
  reach the colony: on a small map, where the walk is short, they gather at the edge until there's an hour and a
  half to get ready (they come on at once if anyone goes out to meet them). The Rust Wardens favour bows, the
  Ashen Howlers clubs and spears; later raids bring better bows, crossbows and armor. The game pauses. Archers on
  both sides look for firing positions behind cover, keep to their range and are rattled (suppressed: worse aim)
  by shots landing close; melee fighters charge. Pain puts a badly hurt raider down, as it does a colonist, and
  hurt raiders may break and run; the raid flees once nearly half of them are down or running. Now and then the
  Meadow Kin send a few fighters to help (more likely the better they think of the colony): they come in from the
  edge, timed to arrive with the raiders, go after them and head home when it's over. Undrafted colonists run indoors when raiders come close, and fight back only
  when cornered. From day 12 about one raider in four is a ravager, who lays waste to what's
  left outside the walls (tramples crops in the fields, attacks livestock) and fights only if someone comes close.
  Walling yourself in doesn't stop them: raiders who can't reach anyone smash through the nearest
  wall or door (clubs and spears break walls faster than bows).
- **Sieges:** from the second year a war party may come to stay instead: they make camp 20–28 tiles from the
  colony, dig in behind sandbags round a fire, shoot anyone who comes within reach, and attack half a day or so
  later. Break the camp early (attacking raiders behind cover) or fortify and face them all at once.
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
- **Skills:** every skill (mining, construction, plants, cooking, crafting, medicine, combat, intellectual,
  animals, artistic) improves with practice, up to 20. Artistic is used for carving sculptures (and, later,
  music). Each colonist has a couple of passions (★ interested, ★★ burning) that speed learning and
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
- **Wild plants and firewood:** outside winter, trees and berry bushes slowly spread onto open grass and soil
  beside their own kind, back towards how wooded the valley started; and seed blows in, so even a valley cut bare
  greens again in time. For wood you can count on, plant poplars in a growing zone: they take six days, shrug off
  frost and are cut for 14 wood a tile. When it's cold and wood runs short, the fires are fed before the
  generators, and an alert says how many days of firewood are left.
- **Weapons, armor and defenses:** one set of weapons for everyone, each with its own reach, rate, accuracy,
  drop-off and armor piercing: fists, knife, club, spear, short bow, recurve bow, longbow (Longbows research) and
  crossbow (Crossbows research). Leather and scale armor (Armor and Scale armor research) turn aside a share of
  every blow, wear down as they do it, and scale armor slows its wearer. Colonists pick up clearly better weapons
  and armor from storage, and fallen raiders drop some of their kit. Sandbags and embrasures (stone wall slots you
  can shoot through but not walk through) cut the chance of being hit from the side they face, and blows struck
  across them (or by someone clambering over sandbags) land less often; spike traps
  (Traps research) wound the first raider to step on them and go back on the build list.
- **Seasons:** a year is four six-day seasons, starting in early spring. Temperatures follow the year (warm
  summers, freezing winter nights). Crops don't grow in winter and hard frost kills anything left in the field,
  so plant enough in spring and summer and harvest before winter.
- **Research:** build a research bench, pick a project in the Research screen, and colonists with the Research
  work type study it (training the Intellectual skill). Twenty-one projects unlock the recurve bow, sandbags, the
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
  often; the Factions screen lists every faction and where you stand with it. Goods sell as they stand: finely
  made pieces fetch more, worn clothes and food about to spoil less, and the worst go first, so the best is
  kept back.
- **Water:** shallow water is slow to wade through and leaves colonists soaked (a small mood hit); deep water
  is impassable until you build a bridge over it. Fishing spots on the shore let hunters catch raw fish while
  the colony is short of food; once there's a roof over everyone and food is down to a day and a half, the
  colony's best hunter (two in a colony of seven or more) goes fishing (or, with no fishing spot, hunting)
  before any other work. In hard frost the shallows freeze from the shore inwards and can be walked
  across; frozen water can still be fished through the ice, at half the pace, and the ice melts again when it
  warms up.
- **Sun lamps:** crops beneath them grow day and night, all year, so a heated greenhouse can farm in winter.
- **Storyteller:** roughly once or twice a day it may send something. Threats (more often on Harsh, rarer on
  Peaceful): raids, marsh fever, cold snaps, summer heat waves, crop blight, eclipses that darken the sky and
  solar panels for a few hours, and packs of maddened boars or wolves (more likely at night, and never more than four wolves) that hunt colonists down one after another. Good
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
    art.ts          Sculpture quality, beauty and titles drawn from the colony's story
    gatherings.ts   Parties, festivals, weddings and funerals: what each is and when
    prisoners.ts    Wounded raiders, capture, prisoners' upkeep and recruiting
    lifespans.ts    Ages, backstories, births, growing up, learning by watching, old age
    minds.ts        Kinds of mental break, inspirations, obsessions and legendary works
    body.ts         Body parts, infection, lasting injuries, hospital beds
    village.ts      The colony's leader, chosen by vote, and its policies
    diplomacy.ts    Neighbours' requests, gifts, and tribute to raiders
    depths.ts       Mine shafts, what they bring up, and breaches from below
    simulation.ts   Fixed-tick loop, needs and mood, colonist AI, job system, reservations, objectives
    serialize.ts    Save format
  game/       Glue between the simulation, renderer, and UI
    controller.ts   Owns the sim, time controls, tools, UI snapshots
    music.ts        Tunes for the instruments: scales, phrases, a beginner's wrong notes
    audio.ts        Web Audio sound: instrument voices, ambience and alerts
    save-store.ts   IndexedDB save slots
  render/     Phaser 4 scene: tilemap layers, colonist sprites, camera, input
  ui/         React management UI
    App.tsx         Layout: top bar, colonist bar, inspector, side panel, architect menu
    hud.tsx         The always-on HUD components
    screens.tsx     Dialogs: work, schedule, production, research, story, village, factions, help, menu
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
before chopping when builders wait on stone, grazers returning to a hunted-out valley, and wild plants regrowing. `src/sim/groundwork.test.ts` covers recreation kinds and the Artistic skill,
`src/sim/recreation.test.ts` covers tolerance, games, stargazing and nature walks, `src/sim/art.test.ts` covers
sculpting, quality, titles, beauty, galleries and surroundings, `src/sim/music.test.ts` covers instruments,
earshot and concerts, `src/game/music.test.ts` covers the tunes,
`src/sim/gatherings.test.ts` covers funerals and graves, weddings, festivals and feasts, parties and memorials,
`src/sim/cleaning.test.ts` covers mess, where it comes from, its cost to beauty and cleaning it,
`src/sim/body.test.ts` covers body parts, infection, lasting injuries and hospital beds,
`src/sim/village.test.ts` covers the vote, the leader's sway and the policies,
`src/sim/diplomacy.test.ts` covers requests, the great boar, gifts, goodwill and tribute,
`src/sim/depths.test.ts` covers mine shafts, their ore and breaches from below,
`src/sim/minds.test.ts` covers kinds of mental break, inspirations and obsessions,
`src/sim/lifespans.test.ts` covers ages, backstories, births, growing up, learning by watching and old age,
`src/sim/production.test.ts` covers grain and bread, drying racks, clay and iron, kilns and smelters,
`src/sim/storage.test.ts` covers fires burning wood, stockpile settings, forbidding, shelves, locked doors and
staying out of the cold, `src/sim/prisoners.test.ts` covers wounded raiders, capture, feeding, recruiting, starving and release, and
`src/render/tileset-layout.test.ts` checks the art layout.

`scripts/balance.ts` is a headless balance harness. An autoplayer builds a sensible colony on several seeds,
puts its best researcher on research, drafts colonists during raids, and reports survival, raids, illness, mood, relationships and starvation (including what starving colonists were doing instead of eating), mood broken down by thought, how often
recreation runs low, and the average impressiveness of each kind of room:

```
npx tsx scripts/balance.ts 26 8                # 26 days (through winter) on 8 seeds, standard difficulty
npx tsx scripts/balance.ts 20 8 passive        # never draft during raids
npx tsx scripts/balance.ts 20 8 harsh          # or peaceful
npx tsx scripts/balance.ts 20 4 trace          # print the colony state whenever someone dies
npx tsx scripts/balance.ts 30 6 size=192       # on a Large map (96 Small, 128 Medium)
npx tsx scripts/balance.ts 30 1 trace seed=7919 # replay one colony (DEBUG=1 adds rooms, bills, research)
npx tsx scripts/balance.ts 48 6 flow           # day-by-day food, materials, crops and wildlife, averaged
```

With the current tuning (8 seeds × 26 days, through the first winter), a Standard colony that farms enough
keeps everyone alive but goes hungry for a while late in winter; Harsh costs around one colonist in six, with
no colony wiped out. First friendships appear around day 6–7, with a few rivalries and couples.

`scripts/playtest.ts` plays 100 simulated players with ten play styles (by the book, farmer, militarist,
neglectful, micromanager, random clicking, artist, warden, save-scummer, demolisher) across every difficulty
and map size. It checks for crashes and impossible state as they play: needs out of range, colonists or items
inside walls, leaked reservations, prisoners off their beds, jobs stuck for a day, saves that don't load back
exactly, and saves that don't play out the same twice. It also reports how each colony fared and why anyone
died:

```
npx tsx scripts/playtest.ts days=20              # all 100 players (from=0 to=25 runs a share of them)
npx tsx scripts/playtest.ts days=20 only=warden  # one play style
npx tsx scripts/playtest.ts days=20 players=3,40 # particular players (TRACE=17 or BUILD=1 for detail)
npx tsx scripts/years.ts 240 1 seed=150461       # a ten-year game, one line a year
```

The harness also takes `craft` (kiln, smelter, bricks, iron and gear), `diplomat` (tribute, policies,
requests), `surplus` and `pen` (hunting and husbandry), and `biome=` / `map=`. `npm run playtest:long` plays
players 40–49 for 120 days (a weekly GitHub workflow runs it too), and `npm run test:e2e` runs the browser
tests (Playwright: every screen, save and load, the phone layout and the Work grid's long press).

[docs/GAPS.md](docs/GAPS.md) lists where the game is thin, unbalanced or untested, with the evidence.

## Roadmap

- **Phase 1 – The playable colony** (done): procedural terrain, 5 autonomous colonists, mining, chopping,
  hauling, building, stockpiles, time controls, save/load.
- **Phase 2 – The living simulation** (done): hunger, sleep, recreation and moods; farming, cooking and crafting; job
  priorities and work schedules; rooms, furniture and temperature.
- **Phase 3 – The storytelling game** (done): relationships and traits; injuries, medicine and disease; combat, raids
  and factions; dynamic events.
- **Phase 5 – Looks and the long game** (done): walking animation, day and night lighting with fires and lamps
  lighting the dark, seasonal terrain with more variety, and the signal beacon that lets a run end on the
  player's terms.
- **Phase 4 – Culture** (done): recreation with variety, games and stargazing; art and decor, with sculptures
  titled after the colony's story; music, concerts and sound; parties, seasonal festivals, weddings, funerals
  and memorials. See [docs/ROADMAP.md](docs/ROADMAP.md) for how each works, the balance results, and what's next.

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
