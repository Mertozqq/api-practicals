import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage } from '../server/storage.js';
import { createServices } from '../server/services.js';
import { startGrpc, createGrpcClient } from '../server/grpc/api.js';
import { createApp } from '../server/app.js';
let directory, store, services, grpcServer, client, server, base;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'api-practicals-'));
  store = await createStorage({ file: join(directory, 'data.json') });
  services = createServices(store);
  grpcServer = await startGrpc(services.items, '127.0.0.1:0');
  client = createGrpcClient(`127.0.0.1:${grpcServer.port}`);
  const app = createApp({ services, grpcClient: client, storageKind: store.kind });
  server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server?.close(resolve)); client?.close(); await grpcServer?.close(); await store?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function http(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
}
const contact = { username: 'Анна Иванова', email: 'anna@example.com', telephone: { mobile: '+7 900 123-45-67', home: '' } };
const graph = (query, variables) => http('/graphql', 'POST', { query, variables });

test('5: REST create, list, read, PUT, PATCH, delete and repeated delete', async () => {
  const created = await http('/api/contacts', 'POST', contact);
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal(created.headers.get('location'), `/api/contacts/${id}`);
  assert.equal((await http('/api/contacts')).body[0].id, id);
  assert.deepEqual((await http(`/api/contacts/${id}`)).body, created.body);
  const replaced = await http(`/api/contacts/${id}`, 'PUT', { ...contact, username: 'Анна Петрова' });
  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.username, 'Анна Петрова');
  assert.equal(replaced.body.createdAt, created.body.createdAt);
  const patched = await http(`/api/contacts/${id}`, 'PATCH', { email: '' });
  assert.equal(patched.body.email, '');
  assert.equal(patched.body.username, 'Анна Петрова');
  assert.equal((await http(`/api/contacts/${id}`, 'DELETE')).status, 204);
  assert.equal((await http(`/api/contacts/${id}`)).status, 404);
  assert.equal((await http(`/api/contacts/${id}`, 'DELETE')).status, 404);
});
test('5: invalid input, immutable IDs, malformed JSON and missing record', async () => {
  for (const body of [null, [], {}, { ...contact, username: '  ' }, { ...contact, email: 'broken' }, { ...contact, telephone: {} }, { ...contact, id: 'owned' }, { ...contact, telephone: { mobile: '<script>' } }]) {
    assert.equal((await http('/api/contacts', 'POST', body)).status, 400);
  }
  assert.equal((await http('/api/contacts/missing', 'PATCH', {})).status, 400);
  assert.equal((await http('/api/contacts/missing', 'PUT', contact)).status, 404);
  const malformed = await fetch(base + '/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const large = await fetch(base + '/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'a'.repeat(70000) }) });
  assert.equal(large.status, 413);
});
test('7: GraphQL CRUD, field selection and user filtering', async () => {
  const created = await graph('mutation($input: CreateItemInput!) { createItem(input: $input) { id text qty completed userId } }', { input: { text: 'Яблоки', qty: 2, userId: 'user-a' } });
  assert.equal(created.status, 200); assert.equal(created.body.errors, undefined);
  const id = created.body.data.createItem.id;
  assert.equal(created.body.data.createItem.completed, false);
  const selected = await graph('query($id: ID!) { item(id: $id) { text } }', { id });
  assert.deepEqual(selected.body.data.item, { text: 'Яблоки' });
  assert.deepEqual((await graph('{ items(userId: "user-b") { id } }')).body.data.items, []);
  const updated = await graph('mutation($id: ID!) { updateItem(id: $id, input: { completed: true, qty: 3 }) { completed qty } }', { id });
  assert.deepEqual(updated.body.data.updateItem, { completed: true, qty: 3 });
  const removed = await graph('mutation($id: ID!) { deleteItem(id: $id) }', { id });
  assert.equal(removed.body.data.deleteItem, true);
  const missing = await graph('query($id: ID!) { item(id: $id) { id } }', { id });
  assert.equal(missing.body.errors[0].extensions.code, 'NOT_FOUND');
});
test('7: schema rejects wrong types, resolver rejects invalid values and nulls', async () => {
  const invalid = await graph('mutation { createItem(input: { text: " ", qty: 0, userId: "x" }) { id } }');
  assert.equal(invalid.body.errors[0].extensions.code, 'BAD_USER_INPUT');
  assert.equal((await graph('mutation { createItem(input: { text: "a", qty: 1.5, userId: "x" }) { id } }')).status, 400);
  assert.equal((await graph('{ unknownField }')).status, 400);
  assert.equal((await http('/graphql', 'POST', { query: 42 })).status, 400);
  const row = await services.items.create({ text: 'Тест', qty: 1, userId: 'null-test' });
  const result = await graph('mutation($id: ID!) { updateItem(id: $id, input: { completed: null }) { id } }', { id: row.id });
  assert.equal(result.body.errors[0].extensions.code, 'BAD_USER_INPUT');
  await services.items.remove(row.id);
});
test('8: real gRPC CRUD and optional false preserve other fields', async () => {
  const row = await client.call('createItem', { text: 'Молоко', qty: 2, userId: 'grpc-user' });
  assert.equal(row.completed, false);
  assert.equal((await client.call('getItem', { id: row.id })).text, 'Молоко');
  assert.equal((await client.call('listItems', { userId: 'grpc-user' })).items.length, 1);
  assert.deepEqual((await client.call('listItems', { userId: 'another-user' })).items, []);
  await client.call('updateItem', { id: row.id, completed: true });
  const updated = await client.call('updateItem', { id: row.id, completed: false });
  assert.equal(updated.completed, false); assert.equal(updated.qty, 2); assert.equal(updated.text, 'Молоко');
  await assert.rejects(client.call('updateItem', { id: row.id, qty: 0 }), error => error.code === 3);
  await assert.rejects(client.call('updateItem', { id: row.id }), error => error.code === 3);
  await assert.rejects(client.call('createItem', { text: '', qty: 1, userId: 'x' }), error => error.code === 3);
  assert.equal((await client.call('deleteItem', { id: row.id })).deleted, true);
  await assert.rejects(client.call('getItem', { id: row.id }), error => error.code === 5);
});
test('8: HTTP gateway calls gRPC; GraphQL sees same data; JSON validation', async () => {
  const created = await http('/rpc/items', 'POST', { text: 'Хлеб', qty: 1, userId: 'gateway' });
  assert.equal(created.status, 201); assert.equal(created.headers.get('x-backend-transport'), 'gRPC');
  const id = created.body.id;
  const viaGraph = await graph('query($id: ID!) { item(id: $id) { text } }', { id });
  assert.equal(viaGraph.body.data.item.text, 'Хлеб');
  assert.equal((await http('/rpc/items?userId=gateway')).body[0].id, id);
  assert.equal((await http(`/rpc/items/${id}`)).body.id, id);
  assert.equal((await http(`/rpc/items/${id}`, 'PATCH', { completed: true })).body.completed, true);
  for (const input of [{ qty: 1.5 }, { qty: 4294967297 }, { completed: 'false' }, { text: null }, { unknown: true }, { userId: 123 }]) assert.equal((await http(`/rpc/items/${id}`, 'PATCH', input)).status, 400);
  assert.equal((await http(`/rpc/items/${id}`, 'DELETE')).status, 204);
  assert.equal((await http(`/rpc/items/${id}`)).status, 404);
});
test('persistent storage survives reopening and concurrent writes keep all records', async () => {
  const path = join(directory, 'persistence.json');
  const first = await createStorage({ file: path });
  const contacts = createServices(first).contacts;
  await Promise.all(Array.from({ length: 15 }, (_, i) => contacts.create({ ...contact, username: `Контакт ${i}` })));
  await first.close();
  const second = await createStorage({ file: path });
  assert.equal((await second.list('contacts')).length, 15);
  const row = (await second.list('contacts'))[0];
  await second.remove('contacts', row.id); await second.close();
  const third = await createStorage({ file: path });
  assert.equal((await third.list('contacts')).length, 14); await third.close();
});
test('6: ReDoc and source schemas are served locally', async () => {
  for (const path of ['/docs', '/docs/redoc.standalone.js', '/openapi.yaml', '/graphql/schema']) {
    const response = await fetch(base + path); assert.equal(response.status, 200, path); await response.arrayBuffer();
  }
});
