export const traces = [];
export async function request(path, options = {}) {
  const started = performance.now();
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  traces.unshift({ method: options.method || 'GET', path, status: response.status, ms: Math.round(performance.now() - started), request: options.body ? JSON.parse(options.body) : null, response: body, transport: response.headers.get('X-Backend-Transport') });
  traces.splice(12);
  if (!response.ok || body?.errors) throw new Error(body?.error || body?.errors?.map(error => error.message).join('; ') || `HTTP ${response.status}`);
  return body;
}
const fields = 'id text qty completed userId createdAt';
async function graph(query, variables) { return (await request('/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) })).data; }
export const contactsApi = {
  list: () => request('/api/contacts'),
  save: (id, input) => request(`/api/contacts${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) }),
  remove: id => request(`/api/contacts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
export function shoppingApi(transport) {
  if (transport === 'graphql') return {
    list: async userId => (await graph(`query Items($userId: ID!) { items(userId: $userId) { ${fields} } }`, { userId })).items,
    save: async (id, input) => id
      ? (await graph(`mutation Update($id: ID!, $input: UpdateItemInput!) { updateItem(id: $id, input: $input) { ${fields} } }`, { id, input })).updateItem
      : (await graph(`mutation Create($input: CreateItemInput!) { createItem(input: $input) { ${fields} } }`, { input })).createItem,
    remove: id => graph('mutation Delete($id: ID!) { deleteItem(id: $id) }', { id }),
  };
  return {
    list: userId => request(`/rpc/items?userId=${encodeURIComponent(userId)}`),
    save: (id, input) => request(`/rpc/items${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) }),
    remove: id => request(`/rpc/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}
