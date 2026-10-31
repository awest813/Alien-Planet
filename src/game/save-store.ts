import { SaveData } from '../sim/serialize';

// Colony saves live in IndexedDB, which can store typed arrays without conversion.

const DB_NAME = 'colony-alpha';
const STORE = 'saves';

export interface SaveMeta {
  slot: string;
  day: number;
  hour: number;
  seed: number;
  savedAt: number;
  // Save format version; missing on saves from before versions were recorded.
  version?: number;
}

interface SaveRecord {
  meta: SaveMeta;
  data: SaveData;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = op(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function writeSave(meta: SaveMeta, data: SaveData): Promise<void> {
  await run('readwrite', (store) => store.put({ meta, data } satisfies SaveRecord, meta.slot));
}

export async function readSave(slot: string): Promise<SaveData | null> {
  const record = await run<SaveRecord | undefined>('readonly', (store) => store.get(slot));
  return record?.data ?? null;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const records = await run<SaveRecord[]>('readonly', (store) => store.getAll());
  return records.map((record) => record.meta);
}
