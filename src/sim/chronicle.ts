// The chronicle: the colony's history as it will be remembered, kept for as long as the colony lasts
// (unlike the log, which only keeps the latest). Notable story entries go into it as they happen:
// the founding, births and deaths, marriages, battles, newcomers, great works and discoveries,
// leaders, and the strange things that came up from below.

export type ChronicleKind =
  | 'founding'
  | 'birth'
  | 'death'
  | 'marriage'
  | 'battle'
  | 'threat'
  | 'newcomer'
  | 'work'
  | 'discovery'
  | 'leader'
  | 'milestone';

export interface ChronicleEntry {
  day: number;
  kind: ChronicleKind;
  text: string;
}

// The most entries kept: a long game's worth, with the oldest of the commonest kinds dropped first.
export const CHRONICLE_LIMIT = 3000;

// Which story entries are history, and what kind.
const RULES: [RegExp, ChronicleKind][] = [
  [/colonists have landed/, 'founding'],
  [/ is born to /, 'birth'],
  [/ has died of /, 'death'],
  [/ are married!/, 'marriage'],
  [/^The raid is over\.|left the colony for dead|turned back before reaching|giving up and leaving/, 'battle'],
  [
    /maddened animals are dealt with|broken into (a|another) cavern|great beast|has slain|woken again|back into the hills/,
    'threat',
  ],
  [/has asked to join|has come to join|who joins the colony|staggered into the colony/, 'newcomer'],
  [/legendary sculpture|has finished their vision/, 'work'],
  [/^Research complete: /, 'discovery'],
  [/has chosen .* as its leader/, 'leader'],
  [
    /goals complete\.|Every goal is complete|The ship has landed|chosen to stay|reached bedrock|made it through the winter/,
    'milestone',
  ],
];

export function chronicleKind(text: string): ChronicleKind | null {
  for (const [re, kind] of RULES) {
    if (re.test(text)) {
      return kind;
    }
  }
  return null;
}

// Research lines are long ("Research complete: X. What it does."): the chronicle keeps the first sentence.
export function chronicleText(kind: ChronicleKind, text: string): string {
  if (kind === 'discovery') {
    return text.replace(/^Research complete: ([^.]+)\..*$/, 'The colony learned $1.');
  }
  return text.replace(/ Draft (your )?colonists.*$| Colonists stand down\.$/, '');
}

export function addToChronicle(chronicle: ChronicleEntry[], entry: ChronicleEntry): void {
  chronicle.push(entry);
  if (chronicle.length > CHRONICLE_LIMIT) {
    // Discoveries go first (they're also on the Research screen), then the oldest of anything but the
    // founding, which always opens the story.
    const k = chronicle.findIndex((e) => e.kind === 'discovery');
    chronicle.splice(k >= 0 ? k : chronicle.findIndex((e) => e.kind !== 'founding'), 1);
  }
}

// For a save from before the chronicle: what the story log still remembers.
export function chronicleFromStory(story: { day: number; text: string }[]): ChronicleEntry[] {
  const chronicle: ChronicleEntry[] = [];
  for (const s of story) {
    const kind = chronicleKind(s.text);
    if (kind) {
      addToChronicle(chronicle, { day: s.day, kind, text: chronicleText(kind, s.text) });
    }
  }
  return chronicle;
}
