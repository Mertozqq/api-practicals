import { test } from 'node:test';
import assert from 'node:assert/strict';
import SwaggerParser from '@apidevtools/swagger-parser';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
test('6: OpenAPI is valid and covers all REST operations', async () => {
  const spec = await SwaggerParser.validate(`${root}/docs/openapi.yaml`);
  assert.equal(spec.openapi, '3.0.3');
  assert.deepEqual(Object.keys(spec.paths['/api/contacts/{id}']).filter(key => key !== 'parameters').sort(), ['delete', 'get', 'patch', 'put']);
});
test('6: real Prism mock serves specification examples and validates requests', { timeout: 90000 }, async () => {
  const port = await new Promise(resolve => { const server = createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
  const child = spawn(process.execPath, ['node_modules/@stoplight/prism-cli/dist/index.js', 'mock', 'docs/openapi.yaml', '-h', '127.0.0.1', '-p', String(port), '--errors'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
  try {
    const base = `http://127.0.0.1:${port}`;
    let response;
    for (let i = 0; i < 300; i++) {
      if (child.exitCode !== null) throw new Error(output);
      try { response = await fetch(`${base}/api/contacts`); break; } catch { await new Promise(resolve => setTimeout(resolve, 150)); }
    }
    assert.ok(response, output); assert.equal(response.status, 200);
    assert.equal((await response.json())[0].username, 'Анна Иванова');
    const create = await fetch(`${base}/api/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Тест', telephone: { mobile: '+7 900 111-22-33' } }) });
    const createdBody = await create.text();
    assert.equal(create.status, 201, `${createdBody}\n${output}`);
    const invalid = await fetch(`${base}/api/contacts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(invalid.status, 400); await invalid.arrayBuffer();
  } finally { if (child.exitCode === null) { const closed = new Promise(resolve => child.once('exit', resolve)); child.kill(); await closed; } }
});
