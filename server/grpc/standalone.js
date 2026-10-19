import { createStorage } from '../storage.js';
import { createServices } from '../services.js';
import { startGrpc } from './api.js';
// A separate local file prevents concurrent writers when both processes run without MongoDB.
const store = await createStorage({ mongoUri: process.env.MONGODB_URI, database: process.env.MONGODB_DB, file: process.env.GRPC_DATA_FILE || './data/grpc.json' });
const server = await startGrpc(createServices(store).items, process.env.GRPC_ADDRESS);
console.log(`gRPC listening on port ${server.port}`);
let closing = false;
async function shutdown() { if (closing) return; closing = true; await server.close(); await store.close(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
