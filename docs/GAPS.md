# Gap list

Where Colony Alpha is thin, unbalanced or untested, from ten-year runs (Small, Medium and Large maps; Peaceful,
Standard and Harsh), 48-day balance runs, 100-player playtests, a newcomer's browser playthrough and code
audits. Each gap says what the evidence is and what would close it. Ordered by how much it would improve the
game; the roadmap (ROADMAP.md) holds the longer plans.

Tools: `scripts/balance.ts` (seeded colonies, summary), `scripts/years.ts` (the same, a line a year),
`scripts/playtest.ts` (100 scripted players with invariants). Bundle with esbuild for speed (see ROADMAP).

## 1. The long game runs out of things to do

- **Research is done by the third year** (partly closed: ten later projects of 10,000–16,000 points). The test
  colony, with a dedicated researcher, finishes the first 18 projects by day 16 and all 30 it studies by about
  day 51. Seven years with nothing to study.
  - Close it with a deeper tree, gated by materials and buildings as well as time: smelting and steel; glass
    and greenhouses; medicine (surgery, prosthetics; see body.ts); late defences; a longer path to the beacon.
- **Goals stop at 41–46 of 50 by year 4.** The rest are niche: sandbags, cold storage, taming, iron, fine art,
  feasts, parkas, recruiting. After that there's no direction.
  - Close it with later goal phases (generations, legends, a great work), or goals that come from the story,
    such as "survive the siege" or "raise a child to adulthood".
- **Silver piles up.** By year 10 colonies hold 7,000–9,000 silver. Caravans now grow with the colony (up to
  three times the goods and purse, with finer wares from day 30), but there is still little to spend on.
  - Close it with silver sinks: commissions from neighbours, hiring help, buying a colonist, ransoming prisoners
    back, paid caravans or expeditions, buildings that cost silver.
- **Wealth grows from about 8k to 40–54k and changes little.** Raids now gain up to 4 raiders above 15k, but
  nothing else responds to a rich colony.

## 2. Raids on Harsh are still lost in the open

- **Partly closed.** Pain now puts raiders down, raids break once 45% are out of the fight, sandbags, embrasures
  and traps come early (no prerequisites), blows across a barricade land less often, and the Meadow Kin sometimes
  send fighters. Share of raids that overran the whole colony, 72 days, 12 seeds:

  | Days  | Standard, in the open (before) | Standard, in the open | Standard, from sandbags | Harsh, in the open |
  | ----- | ------------------------------ | --------------------- | ----------------------- | ------------------ |
  | 13–24 | 61%                            | 22%                   | 6%                      | 79%                |
  | 25–36 | 88%                            | 35%                   | 6%                      | 97%                |
  | 37–72 | ~100%                          | 63–72%                | 15–60%                  | ~96%               |

- **Harsh raids (11 raiders against about 6 colonists) still win nearly every fight in the open**, and a
  Standard colony that never builds cover loses most from day 37. Raiders leave the downed alone, so few die.
  - Close it by sizing raids to the colony's fighters rather than a flat cap, or with more allies on Harsh.
- **Most downed raiders are left to die** (125 fell wounded in twelve 48-day colonies, 10 were taken prisoner).
  The test colony marks them all for capture but builds a single prisoner bed, so this mostly says the harness
  should build more; in play, an alert already walks the player through Capture, a bed and a warden.

## 3. The late game is too safe

- **Ten-year Standard colonies lose about 2 people to raids across 184 raids.** Harsh loses 10 in 251. After the
  first winters the colony is walled, armed and well fed, and raids are the same walk-in-and-shoot every time.
  - Partly closed: the great beast wakes once a year from the second, and returns bigger until slain.
  - Close it with threat variety (Phase M): sieges that camp and build; sappers that dig through rock; raids
    that target the stores or the beacon; a named great beast; infestations from deep shafts; winter famine
    events.
- **Mood sits at 55–65 late with few breaks.** Rising expectations (−6 from year 4) help but don't make the later
  years tense.
  - Close it with needs that grow: room expectations by status, the leader's demands, ageing pains, grief that
    lasts.
- **Disease is toothless** (partly closed: a catching winter cough). There is one disease (marsh fever), with 36–56 cases a colony a decade and no
  deaths.
  - Close it with variety: a winter flu, a plague that spreads by contact, wound infection already exists;
    illness that weighs on the old.

## 4. Factions and the wider world are one-dimensional

- **There is one friendly faction and two hostile ones**, and the hostile ones have no goodwill at all.
  Capturing, releasing, starving or recruiting their people changes nothing with them. Tribute is the only
  dealing.
- **Goodwill with the Meadow Kin ends at 93–100 in nearly every run.** It now cools above 40, but trade and
  frequent gifts keep it pinned; at the top, requests stop mattering.
  - Close it with relations that can go both ways: a rival friendly faction, envoys, alliances with obligations,
    allied help in raids, and costs to refusing an ally (roadmap Phase K).
- **There are no expeditions or wider world.** Nothing happens off the map.

## 5. Relationships and families are thin in places

- **There are no fights, arguments or divorces.** Rivals only cost mood, and marriages never end except by death.
- **Children learn only by watching.** There is no schooling, play between children, or childhood memories
  that shape adults.
- **Elders only slow down.** They need no care and there are no age-related illnesses or retirement.
- **The kin check covers two generations.** That's enough for ten years, but a longer game could reach a
  fourth.

## 6. Animals and the land

- **Wildlife can be wiped out.** The test colony hunts everything on sight, and wildlife sits at zero from year
  one on every map. Migration refills only up to half the cap, and every newcomer is hunted.
  - Close it with hunting limits or consequences: wary herds that leave, seasons when animals are scarce, the
    Meadow Kin minding over-hunting.
- **There is no animal husbandry beyond taming.** No pens, fences, feeding troughs or breeding management;
  tame animals in the test runs number zero.
- **There is one biome and one map type.** No desert, tundra or forest starts, and no rivers or islands as
  deliberate challenges.
- **Food is too easy on Peaceful.** Peaceful colonies stockpile 35–60 days of food; Standard holds 4–8 days.

## 7. Interface and flow

- **There is no history screen** (partly closed: the chronicle on the Story screen). There are no graphs (population, wealth, mood over time) and no chronicle; the
  story log keeps only the latest 200 entries (Phase M's chronicle).
- **There is no colonist overview.** No table of everyone's needs, skills and moods; the colonist bar and Work
  screen cover part of it.
- **Phone polish is basic in places** (partly closed: full-width cards, the goals drawer below the top bar, Work
  and Schedule tables that scroll on their own with names kept in view, painting the schedule by finger, moving
  drafted colonists by tap). There's no long-press to stand in for right-click on the Work grid, tap targets
  are small (speed buttons 34×22), and a phone on its side leaves little map between the bars.

## 8. Testing

- **There's no continuous integration.** Tests, lint and the build run only by hand (`.github/workflows` is
  empty).
- **There are no browser tests in the suite.** UI checks so far have been one-off Playwright scripts.
- **Save compatibility across versions is untested.** There's no stored old save that the tests load.
- **There's no performance regression check.** Busy Large maps measure about 48 ms per 1,000 ticks against a
  60 ms budget, by hand.
- **Playtest personas never reach late content in 16 days.** No deep mining, breaches, elders or generations.
  Run some players for 120+ days regularly (`days=120 players=...`).
- **The balance harness plays one way.** It hunts everything, gifts silver daily, never sets policies or pays
  tribute, and builds no kiln or smelter. Its results say little about those systems.
  - `defend` now fights from cover: sandbags round the hut, longbows early, and bows, armour and leather bought
    from caravans. `policy=` sets the village policies. Still missing: a diplomat and a craftsman.

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
