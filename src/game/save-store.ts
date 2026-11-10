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

// The connection, opened once and kept. A failed or blocked open isn't kept (the next save tries again), and a
// connection the browser closes, or that a newer version of the game in another tab needs closed to upgrade
// the database, is let go so the next call opens a fresh one.
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      settled = true;
      dbPromise = null;
      reject(error instanceof Error || error instanceof DOMException ? error : new Error(String(error)));
    };
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
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        // Opened at last, after this call had given up on it as blocked.
        db.close();
        return;
      }
      settled = true;
      const forget = () => {
        db.close();
        if (dbPromise === opened) {
          dbPromise = null;
        }
      };
      db.onversionchange = forget;
      db.onclose = forget;
      resolve(db);
    };
    request.onerror = () => fail(request.error);
    // Another tab holds an older version of the database open and won't let it go: waiting would hang every save.
    request.onblocked = () =>
      fail(new Error('The saves are in use by another tab of the game: close it and try again.'));
  });
  const opened = dbPromise;
  return opened;
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

// The save and its summary together, or neither (a summary left without its save would be offered by Continue).
export async function deleteSave(slot: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, META], 'readwrite');
    tx.objectStore(STORE).delete(slot);
    tx.objectStore(META).delete(slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listSaves(): Promise<SaveMeta[]> {
  return run<SaveMeta[]>('readonly', (store) => store.getAll(), META);
}
