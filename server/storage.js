import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';

// Both adapters expose the same small repository interface.
export async function createStorage({ mongoUri, database = 'api_practicals', file = './data/database.json' } = {}) {
  if (mongoUri) {
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(database);
    await Promise.all(['contacts', 'items'].map(name => db.collection(name).createIndex({ id: 1 }, { unique: true })));
    const clean = doc => { if (!doc) return null; const { _id, ...value } = doc; return value; };
    return {
      kind: 'mongodb',
      async list(collection, filter = {}) { return (await db.collection(collection).find(filter).sort({ createdAt: 1, id: 1 }).toArray()).map(clean); },
      async get(collection, id) { return clean(await db.collection(collection).findOne({ id })); },
      async insert(collection, fields) {
        const doc = { ...fields, id: randomUUID(), createdAt: new Date().toISOString() };
        await db.collection(collection).insertOne({ ...doc }); return doc;
      },
      async update(collection, id, fields) { return clean(await db.collection(collection).findOneAndUpdate({ id }, { $set: fields }, { returnDocument: 'after' })); },
      async remove(collection, id) { return (await db.collection(collection).deleteOne({ id })).deletedCount === 1; },
      async close() { await client.close(); },
    };
  }
  const path = resolve(file);
  await mkdir(dirname(path), { recursive: true });
  let state;
  try { state = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = { contacts: [], items: [] }; }
  if (!Array.isArray(state.contacts) || !Array.isArray(state.items)) throw new Error('Invalid database file');
  let queue = Promise.resolve();
  // Serialize writes and only publish the new state after an atomic file replacement.
  const mutate = fn => {
    const operation = queue.then(async () => {
      const next = structuredClone(state);
      const result = fn(next);
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(next, null, 2), 'utf8');
      await rename(temporary, path);
      state = next;
      return structuredClone(result);
    });
    queue = operation.catch(() => {});
    return operation;
  };
  return {
    kind: 'json',
    async list(collection, filter = {}) { await queue; return structuredClone(state[collection].filter(row => Object.entries(filter).every(([key, value]) => row[key] === value))); },
    async get(collection, id) { await queue; return structuredClone(state[collection].find(row => row.id === id) ?? null); },
    insert(collection, fields) { return mutate(next => { const row = { ...fields, id: randomUUID(), createdAt: new Date().toISOString() }; next[collection].push(row); return row; }); },
    update(collection, id, fields) { return mutate(next => { const row = next[collection].find(row => row.id === id); if (!row) return null; Object.assign(row, fields); return row; }); },
    remove(collection, id) { return mutate(next => { const index = next[collection].findIndex(row => row.id === id); if (index < 0) return false; next[collection].splice(index, 1); return true; }); },
    async close() { await queue; },
  };
}
