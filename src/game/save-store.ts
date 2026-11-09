import { SaveData } from '../sim/serialize';

// Colony saves live in IndexedDB, which can store typed arrays without conversion.

const DB_NAME = 'colony-alpha';
const STORE = 'saves';
// Each save's summary on its own, so listing the slots doesn't read every colony in full (with a few saves of a
// big map that took a second or two, at every save and every visit to the title).
const META = 'meta';

export interface SaveMeta {
  slot: string;
  day: number;
  hour: number;
  seed: number;
  savedAt: number;
  // Save format version; missing on saves from before versions were recorded.
  version?: number;
  colonists?: number;
  difficulty?: string;
  // Tiles per side.
  mapSize?: number;
  biome?: string;
}

interface SaveRecord {
  meta: SaveMeta;
  data: SaveData;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        db.createObjectStore(STORE);
      }
      if (event.oldVersion < 2) {
        const meta = db.createObjectStore(META);
        // Saves from before: copy their summaries over, once.
        if (event.oldVersion >= 1) {
          const cursor = request.transaction!.objectStore(STORE).openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (c) {
              meta.put((c.value as SaveRecord).meta, c.key);
              c.continue();
            }
          };
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
  name: string = STORE,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = op(db.transaction(name, mode).objectStore(name));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

// The save and its summary together, or neither.
export async function writeSave(meta: SaveMeta, data: SaveData): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, META], 'readwrite');
    tx.objectStore(STORE).put({ meta, data } satisfies SaveRecord, meta.slot);
    tx.objectStore(META).put(meta, meta.slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function readSave(slot: string): Promise<SaveData | null> {
  const record = await run<SaveRecord | undefined>('readonly', (store) => store.get(slot));
  return record?.data ?? null;
}

export async function deleteSave(slot: string): Promise<void> {
  await run('readwrite', (store) => store.delete(slot));
  await run('readwrite', (store) => store.delete(slot), META);
}

export async function listSaves(): Promise<SaveMeta[]> {
  return run<SaveMeta[]>('readonly', (store) => store.getAll(), META);
}
