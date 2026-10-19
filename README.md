# Практические работы 5–8

Один проект с четырьмя разделами. Клиент — **Vue 3**, сервер — **Node.js / Express**.
Это исходники приложения и инструкция запуска, не отчёт.

| Работа | Реализация | Основные файлы |
|---|---|---|
| 5 | Телефонный справочник: REST CRUD, поиск, формы создания/редактирования, подтверждение удаления, MongoDB | `server/app.js`, `server/services.js`, `server/storage.js`, `client/App.vue` |
| 6 | YAML OpenAPI 3.0.3 для справочника, ReDoc, настоящий Prism mock | `docs/openapi.yaml`, `docs/index.html` |
| 7 | Список покупок, вариант 3: GraphQL SDL, Query, Mutation и веб-клиент | `server/graphql/`, `client/api.js` |
| 8 | Список продуктов, вариант 2: Protobuf, gRPC-сервер и клиент, полный CRUD и отметка покупки | `server/grpc/`, `scripts/grpc-demo.js` |

## Быстрый запуск

Нужен Node.js **20.19+**, **22.12+** или **24.x** и npm. Рекомендуется 24.x.
Откройте терминал в этой папке:

```sh
npm ci
npm run build
npm start
```

Откройте **http://localhost:3000**. Переключатели 05–08 находятся слева.
`npm start` одновременно запускает HTTP-сервер на порту 3000 и gRPC на 50051.
Остановка — `Ctrl+C`. Порты должны быть свободны.

Для первого знакомства база не обязательна: по умолчанию данные сохраняются в
`data/database.json`. Они остаются после перезапуска, исходно списки пустые.
Этот режим предназначен для одного процесса приложения. Для MongoDB и размещения
на сервере используйте следующий раздел.

## MongoDB

MongoDB поддерживается настоящим драйвером, это не имитация. Запустите локальную
MongoDB либо используйте URI своей базы. Создайте `.env` из `.env.example`:

```powershell
Copy-Item .env.example .env
```

Добавьте в `.env`:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=api_practicals
```

После `npm start` в консоли и интерфейсе будет указано `MongoDB`.
Создаются коллекции `contacts` и `items`. ID генерируются сервером как UUID;
внутренний MongoDB `_id` в API не раскрывается. Если настроенная база недоступна,
сервер завершится с ошибкой подключения, а не переключится незаметно на файл.
Данные JSON и MongoDB независимы, автоматической миграции между ними нет.

## Практическая 5 — REST

Контакт содержит `id`, `username`, `email`, `telephone.mobile`, `telephone.home`,
`createdAt`. Обязательны имя и хотя бы один телефон. Почту можно оставить пустой.

| Метод | Путь | Результат |
|---|---|---|
| GET | `/api/contacts` | Список, 200 |
| GET | `/api/contacts/:id` | Одна запись, 200 / 404 |
| POST | `/api/contacts` | Создание, 201 и заголовок Location |
| PUT | `/api/contacts/:id` | Полное обновление, 200 |
| PATCH | `/api/contacts/:id` | Частичное обновление, 200 |
| DELETE | `/api/contacts/:id` | Удаление без тела ответа, 204 |

Некорректные поля возвращают 400; отсутствующая запись — 404. `id` и `createdAt`
изменять нельзя. В PATCH объект `telephone`, если передан, заменяется целиком.
Поиск в интерфейсе выполняется по имени, почте и обоим телефонам.

## Практическая 6 — OpenAPI / ReDoc / Prism

При запущенном приложении:

- **http://localhost:3000/docs** — ReDoc. Скрипт документации поставляется с проектом через npm.
- **http://localhost:3000/openapi.yaml** — спецификация, которую можно импортировать в Postman или Swagger Editor.

В другом терминале из папки проекта:

```sh
npm run mock
```

Проверка Prism (в PowerShell используйте именно `curl.exe`):

```powershell
curl.exe http://127.0.0.1:4010/api/contacts
```

Prism возвращает пример Анны Ивановой из YAML. Сопоставьте поля с ReDoc.
Можно использовать запросы из `examples/requests.http`, заменив порт 3000 на 4010.
Prism проверяет входные данные; в контракте предусмотрен ответ 400 для ошибок.
Это **mock**: создание/изменение/удаление не сохраняется и не влияет на следующие
ответы. Для настоящего CRUD используется основной сервер на 3000.

## Практическая 7 — GraphQL

Выберите раздел 07. В соответствии с вариантом 3 реализованы поля `id`, `text`,
`qty`, `completed`, `userId`; дополнительно хранится `createdAt`.
`userId` разделяет списки, но не является авторизацией.

Endpoint: `POST /graphql`. SDL доступен по `/graphql/schema`.

```graphql
query {
  items(userId: "student-1") {
    id
    text
    qty
    completed
    userId
  }
}

mutation {
  createItem(input: { text: "Молоко", qty: 2, userId: "student-1" }) {
    id
    text
  }
}
```

Также реализованы `item(id)`, `updateItem(id, input)` и `deleteItem(id)`.
Полные примеры с переменными находятся в `examples/requests.http`.
Для показа выборки только нужных полей можно запросить `{ items(userId: "student-1") { text } }`.
Клиент отправляет реальные GraphQL-запросы с переменными, не REST-запросы.

## Практическая 8 — gRPC

Выберите раздел 08. Протокол описан в `server/grpc/shopping.proto`:
`ListItems`, `GetItem`, `CreateItem`, `UpdateItem`, `DeleteItem`.
Реализована передача по HTTP/2 с сериализацией Protobuf через `@grpc/grpc-js`.

Путь запроса браузера:

```text
Vue -> HTTP gateway /rpc/items -> Node gRPC client -> gRPC :50051 -> хранилище
```

Браузер использует HTTP-шлюз, поскольку обычный `fetch` не вызывает нативный gRPC.
Шлюз не подменяет gRPC обращением к хранилищу: каждый вызов проходит через настоящий
gRPC-клиент. Ответы шлюза содержат `X-Backend-Transport: gRPC`.

Независимый консольный клиент при работающем `npm start`:

```sh
npm run grpc:demo
```

Он создаёт тестовый продукт, читает его, изменяет, получает список и удаляет продукт.
В Postman можно открыть gRPC-запрос на `127.0.0.1:50051` и импортировать `.proto`.
Поля в proto записаны как `user_id`; Node-клиент использует `userId`.

Для **отдельных процессов** сервера и HTTP-клиента:

1. В `.env` установите `GRPC_EXTERNAL=true`.
2. В первом терминале: `npm run grpc:server`.
3. Во втором: `npm start`.

В файловом режиме отдельный gRPC-сервер хранит данные в `data/grpc.json`, чтобы два
процесса не записывали одновременно один файл. Тогда GraphQL и gRPC имеют разные
списки. Для общих данных между отдельными процессами задайте один `MONGODB_URI` и
`MONGODB_DB`. При обычном `npm start` все интерфейсы используют одно хранилище.

## Проверка и разработка

```sh
npm test
```

Тесты поднимают серверы на свободных портах и используют временные данные.
Проверяются CRUD, ошибки, GraphQL-выборки, реальные gRPC-вызовы, явное значение
`completed: false`, сохранение после открытия базы заново, конкурентные записи,
валидность OpenAPI и запуск реального Prism.

Для включения дополнительного интеграционного теста MongoDB:

```powershell
$env:TEST_MONGODB_URI = "mongodb://127.0.0.1:27017"
npm test
```

Он использует новую случайную базу `api_test_*` и удаляет только её после проверки.
Без этой переменной MongoDB-тест пропускается. При проверке реализации выполнены
все 11 тестов, включая MongoDB, без пропусков. Сборка `npm run build` также прошла.

Для разработки одновременно запустите `npm run dev` и `npm run dev:ui`.
Vite выдаст адрес клиента, обычно http://127.0.0.1:5173. API проксируется на 3000.

## Развёртывание №5 на Heroku

Файлы `Procfile`, `app.json` и `heroku-postbuild` подготовлены. Фактическое размещение
в аккаунте Heroku не выполнено: нужен ваш аккаунт, приложение и база MongoDB.

Из папки проекта после авторизации в Heroku CLI:

```sh
git init
git add .
git commit -m "Implement API practicals 5-8"
heroku create YOUR-APP-NAME
heroku config:set MONGODB_URI="YOUR-MONGODB-URI" MONGODB_DB=api_practicals HOST=0.0.0.0
git push heroku HEAD:main
heroku open
```

Замените значения-заглушки собственными. Убедитесь, что MongoDB разрешает подключения
из Heroku. Секреты не добавляйте в Git. `PORT` назначит платформа автоматически.
Постоянные данные на Heroku должны быть в MongoDB: файловая система dyno временная.
gRPC работает внутри того же процесса через loopback; через публичный URL доступны
веб-клиент и HTTP API, а не отдельный публичный порт 50051.

Приложение учебное, без аутентификации. В общедоступном экземпляре используйте
демонстрационные записи, не личные контакты.

## Ссылки на используемую документацию

- [gRPC для Node.js](https://grpc.io/docs/languages/node/basics/)
- [ReDoc в HTML](https://github.com/Redocly/redoc/blob/main/docs/deployment/html.md)
- [Prism CLI](https://github.com/stoplightio/prism/blob/main/docs/getting-started/03-cli.md)
- [Сборка Node.js на Heroku](https://devcenter.heroku.com/articles/nodejs-classic-buildpack-builds)
- [Временная файловая система Heroku](https://help.heroku.com/K1PPS2WM/why-are-my-file-uploads-missing-deleted-from-the-application)


## Swagger UI

После `npm start` откройте http://localhost:3000/swagger (или /docs).
Выберите метод → Try it out → Execute. Запросы выполняются на текущем сервере.
ReDoc доступен по /redoc, JSON-схема — /openapi.json.
