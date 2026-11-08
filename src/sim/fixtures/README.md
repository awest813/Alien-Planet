# Old saves

Saves written by earlier versions of the game, loaded by `src/sim/oldsaves.test.ts` so a change to the save
format can't quietly break them. Each is a colony two days in, serialized and gzipped, named after the commit
that wrote it.

To add one, check out that commit in a worktree and run something like:

```ts
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { Simulation } from './src/sim/simulation';
import { serialize } from './src/sim/serialize';
const sim = Simulation.newColony(4242);
for (let t = 0; t < 200 * 24 * 2; t++) sim.step();
writeFileSync('save-<commit>.json.gz', gzipSync(JSON.stringify(serialize(sim)), { level: 9 }));
```
