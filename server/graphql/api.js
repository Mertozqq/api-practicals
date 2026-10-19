import { readFileSync } from 'node:fs';
import { buildSchema, graphql, GraphQLError } from 'graphql';
import { AppError, validId } from '../services.js';
export const schema = buildSchema(readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'));
export function graphHandler(items) {
  const wrap = fn => async args => {
    try { return await fn(args); }
    catch (error) {
      if (!(error instanceof AppError)) console.error(error);
      throw new GraphQLError(error instanceof AppError ? error.message : 'Внутренняя ошибка сервера', { extensions: { code: error.status === 404 ? 'NOT_FOUND' : error instanceof AppError ? 'BAD_USER_INPUT' : 'INTERNAL_SERVER_ERROR' } });
    }
  };
  const rootValue = {
    items: wrap(({ userId }) => items.list({ userId: validId(userId, 'userId') })),
    item: wrap(({ id }) => items.get(id)),
    createItem: wrap(({ input }) => items.create(input)),
    updateItem: wrap(({ id, input }) => items.update(id, input, true)),
    deleteItem: wrap(({ id }) => items.remove(id)),
  };
  return async (req, res) => {
    const { query, variables, operationName } = req.body ?? {};
    if (typeof query !== 'string' || (variables != null && (typeof variables !== 'object' || Array.isArray(variables))) || (operationName != null && typeof operationName !== 'string')) return res.status(400).json({ errors: [{ message: 'Некорректный GraphQL-запрос' }] });
    const result = await graphql({ schema, source: query, variableValues: variables, operationName, rootValue });
    res.status(result.errors && !('data' in result) ? 400 : 200).json(result);
  };
}
