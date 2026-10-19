import { createGrpcClient } from '../server/grpc/api.js';
const client = createGrpcClient(process.env.GRPC_ADDRESS);
let id;
try {
  const row = await client.call('createItem', { text: 'Молоко', qty: 2, userId: 'grpc-demo' });
  id = row.id;
  console.log('CREATE', row);
  console.log('READ', await client.call('getItem', { id }));
  console.log('UPDATE', await client.call('updateItem', { id, completed: true, qty: 3 }));
  console.log('LIST', await client.call('listItems', { userId: 'grpc-demo' }));
  console.log('DELETE', await client.call('deleteItem', { id }));
  id = null;
} finally {
  if (id) await client.call('deleteItem', { id }).catch(() => {});
  client.close();
}
