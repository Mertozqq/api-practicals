import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createStorage } from '../server/storage.js';
import { createServices } from '../server/services.js';

test('MongoDB adapter: persistent CRUD and concurrent writes', { skip: !process.env.TEST_MONGODB_URI }, async () => {
  const mongoUri = process.env.TEST_MONGODB_URI;
  const database = `api_test_${randomUUID().replaceAll('-', '')}`;
  let store;
  try {
    store = await createStorage({ mongoUri, database });
    let service = createServices(store);
    const contact = await service.contacts.create({ username: 'Mongo Test', telephone: { home: '12345' } });
    assert.equal((await service.contacts.get(contact.id)).username, 'Mongo Test');
    await service.contacts.update(contact.id, { username: 'Updated' }, true);
    const items = await Promise.all(Array.from({ length: 6 }, (_, i) => service.items.create({ text: `Item ${i}`, qty: 1, userId: 'mongo-user' })));
    await service.items.update(items[0].id, { completed: true }, true);
    await store.close();
    store = await createStorage({ mongoUri, database });
    service = createServices(store);
    assert.equal((await service.contacts.get(contact.id)).username, 'Updated');
    assert.equal((await service.items.list({ userId: 'mongo-user' })).length, 6);
    assert.equal((await service.items.get(items[0].id)).completed, true);
    assert.equal((await service.items.list({ userId: 'other' })).length, 0);
    await service.contacts.remove(contact.id);
    await assert.rejects(service.contacts.get(contact.id), error => error.status === 404);
    await assert.rejects(service.contacts.update('missing', { username: 'Missing' }, true), error => error.status === 404);
  } finally {
    await store?.close();
    const cleanup = new MongoClient(mongoUri); await cleanup.connect();
    await cleanup.db(database).dropDatabase(); await cleanup.close();
  }
});
