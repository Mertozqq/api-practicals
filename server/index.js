import { createStorage } from './storage.js';
import { createServices } from './services.js';
import { startGrpc, createGrpcClient } from './grpc/api.js';
import { createApp } from './app.js';

const store = await createStorage({ mongoUri: process.env.MONGODB_URI, database: process.env.MONGODB_DB, file: process.env.DATA_FILE });
const services = createServices(store);
const address = process.env.GRPC_ADDRESS || '127.0.0.1:50051';
let grpcServer;
let grpcClient;
let httpServer;
try {
  grpcServer = process.env.GRPC_EXTERNAL === 'true' ? null : await startGrpc(services.items, address);
  grpcClient = createGrpcClient(address);
  const app = createApp({ services, grpcClient, storageKind: store.kind });
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  httpServer = await new Promise((resolve, reject) => { const server = app.listen(port, host, () => resolve(server)); server.once('error', reject); });
  console.log(`Приложение: http://localhost:${port}\nSwagger UI: http://localhost:${port}/swagger\nReDoc: http://localhost:${port}/redoc\ngRPC: ${address}\nХранилище: ${store.kind}`);
} catch (error) {
  grpcClient?.close();
  await grpcServer?.close();
  await store.close();
  throw error;
}
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await new Promise(resolve => httpServer.close(resolve));
  grpcClient.close();
  await grpcServer?.close();
  await store.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
