import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { fileURLToPath } from 'node:url';
import { AppError, validId } from '../services.js';
const definition = protoLoader.loadSync(fileURLToPath(new URL('./shopping.proto', import.meta.url)), { defaults: true, oneofs: true });
export const ShoppingService = grpc.loadPackageDefinition(definition).shopping.ShoppingService;
export async function startGrpc(items, address = '127.0.0.1:50051') {
  const server = new grpc.Server();
  const handler = fn => async (call, callback) => {
    try { callback(null, await fn(call.request)); }
    catch (error) {
      if (!(error instanceof AppError)) console.error(error);
      callback({ code: error.status === 404 ? grpc.status.NOT_FOUND : error instanceof AppError ? grpc.status.INVALID_ARGUMENT : grpc.status.INTERNAL, details: error instanceof AppError ? error.message : 'Внутренняя ошибка сервера' });
    }
  };
  server.addService(ShoppingService.service, {
    listItems: handler(async ({ userId }) => ({ items: await items.list({ userId: validId(userId, 'userId') }) })),
    getItem: handler(({ id }) => items.get(id)),
    createItem: handler(({ text, qty, completed, userId }) => items.create({ text, qty, completed, userId })),
    updateItem: handler(request => {
      const input = {};
      for (const key of ['text', 'qty', 'completed', 'userId']) if (Object.hasOwn(request, key)) input[key] = request[key];
      return items.update(request.id, input, true);
    }),
    deleteItem: handler(async ({ id }) => ({ deleted: await items.remove(id) })),
  });
  const port = await new Promise((resolve, reject) => server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error, port) => error ? reject(error) : resolve(port)));
  return { server, port, close: () => new Promise((resolve, reject) => server.tryShutdown(error => error ? reject(error) : resolve())) };
}
export function createGrpcClient(address = '127.0.0.1:50051') {
  const client = new ShoppingService(address, grpc.credentials.createInsecure());
  return {
    call(method, request) { return new Promise((resolve, reject) => client[method](request, { deadline: Date.now() + 5000 }, (error, response) => error ? reject(error) : resolve(response))); },
    close() { client.close(); },
  };
}
