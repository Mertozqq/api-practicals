export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('Ожидается JSON-объект');
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) throw new AppError(`Неизвестные поля: ${unknown.join(', ')}`);
}
function string(value, name, max, required = true) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max) throw new AppError(`Поле ${name}: требуется строка ${required ? 'от 1 ' : ''}до ${max} символов`);
  return value.trim();
}
export function validId(value, name = 'id') { return string(value, name, 100); }
function contactInput(input, partial = false) {
  object(input, ['username', 'email', 'telephone']);
  const data = {};
  if (!partial || 'username' in input) data.username = string(input.username, 'username', 120);
  if (!partial || 'email' in input) {
    data.email = string(input.email, 'email', 254, false);
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new AppError('Некорректный email');
  }
  if (!partial || 'telephone' in input) {
    const phone = input.telephone ?? {};
    object(phone, ['mobile', 'home']);
    data.telephone = {};
    for (const key of ['mobile', 'home']) {
      const value = string(phone[key], key, 40, false);
      if (value && !/^\+?[0-9() .-]{3,40}$/.test(value)) throw new AppError(`Некорректный телефон: ${key}`);
      data.telephone[key] = value;
    }
    if (!data.telephone.mobile && !data.telephone.home) throw new AppError('Укажите хотя бы один телефон');
  }
  if (partial && !Object.keys(data).length) throw new AppError('Нет полей для обновления');
  return data;
}
function itemInput(input, partial = false) {
  object(input, ['text', 'qty', 'completed', 'userId']);
  const data = {};
  if (!partial || 'text' in input) data.text = string(input.text, 'text', 120);
  if (!partial || 'userId' in input) data.userId = validId(input.userId, 'userId');
  if (!partial || 'qty' in input) {
    if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 9999) throw new AppError('Количество должно быть целым числом от 1 до 9999');
    data.qty = input.qty;
  }
  if (!partial || 'completed' in input) {
    const value = input.completed === undefined ? false : input.completed;
    if (typeof value !== 'boolean') throw new AppError('completed должен быть true или false');
    data.completed = value;
  }
  if (partial && !Object.keys(data).length) throw new AppError('Нет полей для обновления');
  return data;
}
export function createServices(store) {
  const service = (collection, validate) => ({
    list(filter) { return store.list(collection, filter); },
    async get(id) { const row = await store.get(collection, validId(id)); if (!row) throw new AppError('Запись не найдена', 404); return row; },
    create(input) { return store.insert(collection, validate(input)); },
    async update(id, input, partial = false) {
      validId(id); const fields = validate(input, partial);
      const row = await store.update(collection, id, fields);
      if (!row) throw new AppError('Запись не найдена', 404); return row;
    },
    async remove(id) { if (!await store.remove(collection, validId(id))) throw new AppError('Запись не найдена', 404); return true; },
  });
  return { contacts: service('contacts', contactInput), items: service('items', itemInput) };
}
