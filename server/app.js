import express from 'express';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import swaggerUi from 'swagger-ui-dist';
import { AppError } from './services.js';
import { graphHandler } from './graphql/api.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const specification = parse(readFileSync(`${root}/docs/openapi.yaml`, 'utf8'));

export function createApp({ services, grpcClient, storageKind }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (req, res) => res.json({ status: 'ok', storage: storageKind }));
  const contacts = services.contacts;
  app.get('/api/contacts', async (req, res) => res.json(await contacts.list()));
  app.get('/api/contacts/:id', async (req, res) => res.json(await contacts.get(req.params.id)));
  app.post('/api/contacts', async (req, res) => {
    const row = await contacts.create(req.body);
    res.location(`/api/contacts/${row.id}`).status(201).json(row);
  });
  app.put('/api/contacts/:id', async (req, res) => res.json(await contacts.update(req.params.id, req.body)));
  app.patch('/api/contacts/:id', async (req, res) => res.json(await contacts.update(req.params.id, req.body, true)));
  app.delete('/api/contacts/:id', async (req, res) => { await contacts.remove(req.params.id); res.sendStatus(204); });
  app.post('/graphql', graphHandler(services.items));
  app.get('/graphql/schema', (req, res) => res.type('text/plain').send(readFileSync(`${root}/server/graphql/schema.graphql`, 'utf8')));

  // Browser -> HTTP gateway -> real gRPC client -> gRPC server -> repository.
  // This gateway intentionally never calls the item service directly.
  const rpc = async (method, input) => {
    try { return await grpcClient.call(method, input); }
    catch (error) {
      const status = { 3: 400, 5: 404, 4: 504, 14: 503 }[error.code] ?? 500;
      throw new AppError(status === 500 ? 'Ошибка gRPC-сервера' : error.details, status);
    }
  };
  // Validate JSON before serialization: protobuf would otherwise coerce wrong types.
  function rpcInput(input, update = false) {
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new AppError('Ожидается JSON-объект');
    const keys = Object.keys(input);
    if (keys.some(key => !['text', 'qty', 'completed', 'userId'].includes(key))) throw new AppError('Неизвестное поле');
    if (!update && !['text', 'qty', 'userId'].every(key => Object.hasOwn(input, key))) throw new AppError('Укажите text, qty и userId');
    if ('text' in input && typeof input.text !== 'string') throw new AppError('text должен быть строкой');
    if ('userId' in input && typeof input.userId !== 'string') throw new AppError('userId должен быть строкой');
    if ('qty' in input && (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 9999)) throw new AppError('Количество: целое число от 1 до 9999');
    if ('completed' in input && typeof input.completed !== 'boolean') throw new AppError('completed должен быть логическим значением');
    return input;
  }
  app.use('/rpc', (req, res, next) => { res.set('X-Backend-Transport', 'gRPC'); next(); });
  app.get('/rpc/items', async (req, res) => res.json((await rpc('listItems', { userId: typeof req.query.userId === 'string' ? req.query.userId : '' })).items));
  app.get('/rpc/items/:id', async (req, res) => res.json(await rpc('getItem', { id: req.params.id })));
  app.post('/rpc/items', async (req, res) => res.status(201).json(await rpc('createItem', rpcInput(req.body))));
  app.patch('/rpc/items/:id', async (req, res) => res.json(await rpc('updateItem', { ...rpcInput(req.body, true), id: req.params.id })));
  app.delete('/rpc/items/:id', async (req, res) => { await rpc('deleteItem', { id: req.params.id }); res.sendStatus(204); });

  app.get('/openapi.yaml', (req, res) => res.sendFile(`${root}/docs/openapi.yaml`));
  app.get('/openapi.json', (req, res) => res.json({ ...specification, servers: [{ url: '/', description: 'Текущий сервер приложения' }] }));
  app.get(['/docs', '/swagger', '/swagger/'], (req, res) => res.sendFile(`${root}/docs/swagger.html`));
  app.use('/swagger-assets', express.static(swaggerUi.absolutePath()));
  app.get('/redoc', (req, res) => res.sendFile(`${root}/docs/index.html`));
  app.get('/docs/redoc.standalone.js', (req, res) => res.sendFile(`${root}/node_modules/redoc/bundles/redoc.standalone.js`));
  app.use(express.static(`${root}/dist`));
  app.use((req, res) => res.status(404).json({ error: 'Маршрут не найден' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof AppError ? error.status : error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 500 ? 'Внутренняя ошибка сервера' : error instanceof AppError ? error.message : status === 413 ? 'Слишком большой запрос' : 'Некорректный JSON' });
  });
  return app;
}
