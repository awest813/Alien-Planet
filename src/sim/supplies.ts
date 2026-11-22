// What the colonists land with, chosen on the New colony screen. Every choice has the same rations, salvaged timber
// (and on an island the boat's timbers and a fishing spot); this is what comes with them in place of the purse of
// silver for the first traders: goods worth about the same, to start the way the player means to go on.
export type Supplies = 'silver' | 'tools' | 'medicine' | 'provisions' | 'building';

export interface SuppliesDef {
  key: Supplies;
  label: string;
  description: string;
  // What's unloaded, by item key, for a landing party of `landing`.
  goods: (landing: number) => [string, number][];
  // The same in words, for the landing's log line ("with a few days of rations, some salvaged timber and ...").
  // None for silver: the line was always without it.
  words?: (landing: number) => string;
}

// What's kept of the purse whatever else comes.
const POCKET_SILVER = 20;

export const SUPPLIES: SuppliesDef[] = [
  {
    key: 'silver',
    label: 'Silver',
    description: '100 silver to buy what the first traders bring.',
    goods: () => [['silver', 100]],
  },
  {
    key: 'tools',
    label: 'Tools',
    // (The first kit was made two or three weeks in: granite goes into building as fast as it's mined.)
    description: 'Two tool kits: two colonists build, farm, chop and mine a third faster from the first day.',
    goods: () => [
      ['toolKit', 2],
      ['silver', POCKET_SILVER],
    ],
    words: () => 'two tool kits',
  },
  {
    key: 'medicine',
    label: 'Medicine',
    description: 'Six herbal medicine, for the first wounds and fevers before any healroot is grown.',
    goods: () => [
      ['herbalMedicine', 6],
      ['silver', POCKET_SILVER],
    ],
    words: () => 'six herbal medicine',
  },
  {
    key: 'provisions',
    label: 'Provisions',
    // (About a meal and a half a day each: three is two days' food. Meals keep five days.)
    description: 'Three more meals each, about two days of food: time to build before anyone must farm or hunt.',
    goods: (landing) => [
      ['meal', 3 * landing],
      ['silver', POCKET_SILVER],
    ],
    words: () => 'two more days of meals',
  },
  {
    key: 'building',
    label: 'Building stock',
    description: '60 wood and 40 granite chunks: walls, a hearth and tool kits before anyone has mined.',
    goods: () => [
      ['wood', 60],
      ['stone', 40],
      ['silver', POCKET_SILVER],
    ],
    words: () => 'building stock (60 wood and 40 granite chunks)',
  },
];

export const suppliesDef = (key: string | undefined): SuppliesDef => SUPPLIES.find((s) => s.key === key) ?? SUPPLIES[0];
