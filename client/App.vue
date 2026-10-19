<script setup>
import { computed, onMounted, ref } from 'vue';
import { contactsApi, shoppingApi, traces, request } from './api';
const section = ref('contacts');
const tabs = [
  { id: 'contacts', number: '05', name: 'Контакты', type: 'REST API' },
  { id: 'docs', number: '06', name: 'Документация', type: 'OpenAPI' },
  { id: 'graphql', number: '07', name: 'Список покупок', type: 'GraphQL' },
  { id: 'grpc', number: '08', name: 'Список покупок', type: 'gRPC' },
];
const current = computed(() => tabs.find(tab => tab.id === section.value));
const contacts = ref([]), items = ref([]), filter = ref(''), statusFilter = ref('all');
const userId = ref('student-1');
const activeUser = ref('student-1');
const busy = ref(false), error = ref(''), notice = ref(''), storage = ref('');
const editor = ref(false), editId = ref(null), deleting = ref(null);
const contact = ref({}), item = ref({});
const log = ref([]), showLog = ref(false);
const visibleContacts = computed(() => contacts.value.filter(row => [row.username, row.email, row.telephone.mobile, row.telephone.home].join(' ').toLowerCase().includes(filter.value.toLowerCase())));
const visibleItems = computed(() => items.value.filter(row => row.text.toLowerCase().includes(filter.value.toLowerCase()) && (statusFilter.value === 'all' || row.completed === (statusFilter.value === 'done'))));
const completed = computed(() => items.value.filter(row => row.completed).length);
async function run(action) {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try { await action(); } catch (e) { error.value = e.message || 'Не удалось связаться с сервером'; }
  finally { busy.value = false; log.value = [...traces]; }
}
async function load() {
  if (section.value === 'contacts') contacts.value = await contactsApi.list();
  else if (section.value !== 'docs') items.value = await shoppingApi(section.value).list(activeUser.value);
}
async function changeSection(id) {
  if (busy.value) return;
  section.value = id; filter.value = ''; editor.value = false; deleting.value = null;
  await run(load);
}
function openEditor(row = null) {
  editId.value = row?.id || null;
  contact.value = row && section.value === 'contacts' ? JSON.parse(JSON.stringify(row)) : { username: '', email: '', telephone: { mobile: '', home: '' } };
  item.value = row && section.value !== 'contacts' ? { ...row } : { text: '', qty: 1, completed: false };
  editor.value = true;
}
async function save() {
  await run(async () => {
    if (section.value === 'contacts') {
      const { username, email, telephone } = contact.value;
      await contactsApi.save(editId.value, { username, email, telephone });
    } else {
      const { text, qty, completed } = item.value;
      await shoppingApi(section.value).save(editId.value, { text, qty, completed, userId: activeUser.value });
    }
    editor.value = false; await load(); notice.value = 'Изменения сохранены';
  });
}
async function toggle(row) {
  await run(async () => { await shoppingApi(section.value).save(row.id, { completed: !row.completed }); await load(); });
}
async function remove() {
  await run(async () => {
    const api = section.value === 'contacts' ? contactsApi : shoppingApi(section.value);
    await api.remove(deleting.value.id); deleting.value = null; await load(); notice.value = 'Запись удалена';
  });
}
async function applyUser() {
  await run(async () => {
    if (!userId.value.trim()) throw new Error('Укажите идентификатор пользователя');
    const next = userId.value.trim();
    const rows = await shoppingApi(section.value).list(next);
    activeUser.value = next; items.value = rows;
  });
}
onMounted(() => run(async () => { storage.value = (await request('/health')).storage; await load(); }));
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="Главная"><span class="brand-icon">a↗</span><span>api<span class="brand-light">.practice</span></span></a>
      <div class="sidebar-label">ПРАКТИЧЕСКИЕ РАБОТЫ</div>
      <nav aria-label="Практические работы">
        <button v-for="tab in tabs" :key="tab.id" :class="['nav-item', { active: section === tab.id }]" :disabled="busy" @click="changeSection(tab.id)">
          <span class="nav-number">{{ tab.number }}</span><span><strong>{{ tab.name }}</strong><small>{{ tab.type }}</small></span><span class="nav-arrow">↗</span>
        </button>
      </nav>
      <div class="sidebar-bottom"><span class="status-dot"></span> Локальный практикум<small>Vue 3 · Node.js<br>Четыре работы. Один проект.</small></div>
    </aside>

    <main>
      <header class="topbar"><span>Интерфейсы прикладного программирования</span><span class="storage">{{ storage === 'mongodb' ? 'MongoDB' : storage === 'json' ? 'Локальное хранилище' : 'Подключение…' }}</span></header>
      <div class="content">
        <div class="eyebrow">ПРАКТИЧЕСКАЯ {{ current.number }} <span>/ {{ current.type }}</span></div>
        <div class="heading-row"><div><h1>{{ section === 'contacts' ? 'Телефонный справочник' : section === 'docs' ? 'Контракт и документация' : 'Список покупок' }}</h1><p class="subtitle">{{ section === 'contacts' ? 'Все нужные люди — в одном месте.' : section === 'docs' ? 'Спецификация API, интерактивная документация и mock-сервер.' : 'Добавляйте продукты, меняйте количество и отмечайте покупки.' }}</p></div><button v-if="section !== 'docs'" class="primary" :disabled="busy" @click="openEditor()">+ {{ section === 'contacts' ? 'Добавить контакт' : 'Добавить продукт' }}</button></div>

        <div v-if="error" role="alert" class="message error">{{ error }}</div>
        <div v-if="notice" role="status" class="message success">{{ notice }}</div>

        <template v-if="section === 'docs'">
          <div class="doc-grid">
            <a href="/swagger" target="_blank" rel="noopener" class="doc-card"><span class="doc-number">01 / ВЫПОЛНИТЬ ЗАПРОС</span><h2>Swagger UI ↗</h2><p>Выберите метод API, нажмите Try it out и Execute. Здесь можно создавать, читать, изменять и удалять контакты.</p><span class="text-link">Открыть Swagger</span></a>
            <a href="/redoc" target="_blank" rel="noopener" class="doc-card"><span class="doc-number">02 / ЧИТАТЬ</span><h2>ReDoc ↗</h2><p>Описание параметров, схем данных, ответов и примеров для всех методов справочника.</p><span class="text-link">Открыть ReDoc</span></a>
          </div>
          <div class="panel mock-panel"><span class="eyebrow">03 / ПРОВЕРИТЬ</span><h2>Имитационный сервер Prism</h2><p>В отдельном терминале запустите команду из папки проекта:</p><pre>npm run mock</pre><p>Затем выполните запрос. Prism вернёт пример из OpenAPI:</p><pre>curl http://127.0.0.1:4010/api/contacts</pre><p class="muted">Mock-сервер показывает контракт и проверяет запросы. Для сохранения изменений используется основной REST API на порту 3000.</p><a class="text-link" href="http://127.0.0.1:4010/api/contacts" target="_blank" rel="noopener">Проверить запущенный Prism ↗</a></div>
        </template>

        <template v-else>
          <div v-if="section !== 'contacts'" class="shopping-overview">
            <form class="user-form" @submit.prevent="applyUser"><label for="user-id">Список пользователя</label><div><input id="user-id" v-model="userId" maxlength="100" required :disabled="busy"><button class="secondary" :disabled="busy">Открыть</button></div><small>Текущий: {{ activeUser }} · ID группирует записи, вход не требуется.</small></form>
            <div class="stat"><strong>{{ items.length }}</strong><span>продуктов</span></div><div class="stat"><strong>{{ completed }}</strong><span>уже куплено</span></div><div class="stat"><strong>{{ items.length - completed }}</strong><span>осталось</span></div>
          </div>
          <div class="panel list-panel">
            <div class="list-toolbar"><div class="search-wrap"><span>⌕</span><input v-model="filter" :placeholder="section === 'contacts' ? 'Поиск по имени, телефону или почте' : 'Найти продукт'" aria-label="Поиск"></div><select v-if="section !== 'contacts'" v-model="statusFilter" aria-label="Фильтр покупок"><option value="all">Все продукты</option><option value="todo">Нужно купить</option><option value="done">Куплено</option></select><span v-else class="count">{{ contacts.length }} контактов</span><button class="icon-button" :disabled="busy" aria-label="Обновить список" title="Обновить список" @click="run(load)">↻</button></div>
            <div v-if="busy" role="status" class="loading">Выполняется запрос…</div>
            <div v-if="section === 'contacts' && visibleContacts.length" class="table-scroll"><table><thead><tr><th>ИМЯ</th><th>МОБИЛЬНЫЙ</th><th>ДОМАШНИЙ</th><th>ПОЧТА</th><th><span class="sr-only">Действия</span></th></tr></thead><tbody><tr v-for="row in visibleContacts" :key="row.id"><td><div class="person"><span class="avatar">{{ row.username.slice(0, 1).toUpperCase() }}</span><strong>{{ row.username }}</strong></div></td><td>{{ row.telephone.mobile || '—' }}</td><td>{{ row.telephone.home || '—' }}</td><td>{{ row.email || '—' }}</td><td><div class="row-actions"><button :disabled="busy" @click="openEditor(row)" :aria-label="`Изменить ${row.username}`">Изменить</button><button class="danger-text" :disabled="busy" @click="deleting = row" :aria-label="`Удалить ${row.username}`">Удалить</button></div></td></tr></tbody></table></div>
            <div v-else-if="section !== 'contacts' && visibleItems.length" class="shopping-list"><div v-for="row in visibleItems" :key="row.id" :class="['shopping-row', { purchased: row.completed }]"><input type="checkbox" :checked="row.completed" :disabled="busy" @change="toggle(row)" :aria-label="`Куплено: ${row.text}`"><div class="product-name"><strong>{{ row.text }}</strong><span>{{ row.completed ? 'Куплено' : 'Нужно купить' }}</span></div><span class="quantity">{{ row.qty }} шт.</span><div class="row-actions"><button :disabled="busy" @click="openEditor(row)" :aria-label="`Изменить ${row.text}`">Изменить</button><button class="danger-text" :disabled="busy" @click="deleting = row" :aria-label="`Удалить ${row.text}`">Удалить</button></div></div></div>
            <div v-else-if="!busy" class="empty"><div class="empty-icon">{{ section === 'contacts' ? '☏' : '✓' }}</div><h2>{{ filter || statusFilter !== 'all' ? 'Ничего не найдено' : section === 'contacts' ? 'Ваш справочник начинается здесь' : 'Что нужно купить?' }}</h2><p>{{ filter || statusFilter !== 'all' ? 'Попробуйте изменить поиск или фильтр.' : section === 'contacts' ? 'Добавьте первый контакт — он сохранится после перезапуска.' : 'Добавьте первый продукт в список пользователя ' + activeUser + '.' }}</p><button v-if="!filter && statusFilter === 'all'" class="secondary" @click="openEditor()">{{ section === 'contacts' ? 'Создать контакт' : 'Добавить продукт' }}</button></div>
            <div class="list-footer"><span>{{ section === 'contacts' ? 'REST · /api/contacts' : section === 'graphql' ? 'GraphQL · /graphql' : 'HTTP-клиент → gRPC · Protobuf' }}</span><button @click="showLog = !showLog">{{ showLog ? 'Скрыть запросы ↑' : 'Показать запросы ↗' }}</button></div>
          </div>
          <div v-if="showLog" class="panel request-log"><h2>Последние запросы</h2><p class="muted">Реальные запросы клиента и ответы сервера. Последние 12 обращений.</p><details v-for="(entry, index) in log" :key="index"><summary><b>{{ entry.method }}</b> {{ entry.path }} <span>{{ entry.status }} · {{ entry.ms }} мс {{ entry.transport ? '· gRPC' : '' }}</span></summary><pre>{{ JSON.stringify({ request: entry.request, response: entry.response }, null, 2) }}</pre></details></div>
        </template>
        <footer class="page-footer"><span>API PRACTICE / 2026</span><span>{{ current.type }} · Практическая {{ current.number }}</span></footer>
      </div>
    </main>

    <div v-if="editor" class="modal-backdrop" @click.self="!busy && (editor = false)" @keydown.esc="!busy && (editor = false)"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title"><div class="modal-heading"><h2 id="edit-title">{{ editId ? 'Редактирование' : section === 'contacts' ? 'Новый контакт' : 'Новый продукт' }}</h2><button class="icon-button" aria-label="Закрыть" :disabled="busy" @click="editor = false">×</button></div><form @submit.prevent="save"><template v-if="section === 'contacts'"><label>Имя<input v-model="contact.username" required maxlength="120" autocomplete="name" autofocus></label><label>Электронная почта<input v-model="contact.email" type="email" maxlength="254" autocomplete="email"></label><label>Мобильный телефон<input v-model="contact.telephone.mobile" type="tel" maxlength="40" placeholder="+7 900 123-45-67" autocomplete="tel"></label><label>Домашний телефон<input v-model="contact.telephone.home" type="tel" maxlength="40"></label><p class="muted">Укажите хотя бы один телефон.</p></template><template v-else><label>Название продукта<input v-model="item.text" required maxlength="120" autofocus></label><label>Количество, шт.<input v-model.number="item.qty" type="number" required min="1" max="9999" step="1"></label><label class="check-label"><input v-model="item.completed" type="checkbox">Уже куплено</label></template><div v-if="error" role="alert" class="message error">{{ error }}</div><div class="modal-actions"><button type="button" class="secondary" :disabled="busy" @click="editor = false">Отмена</button><button class="primary" :disabled="busy">{{ busy ? 'Сохранение…' : 'Сохранить' }}</button></div></form></section></div>
    <div v-if="deleting" class="modal-backdrop" @click.self="!busy && (deleting = null)"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Удалить запись?</h2><p>«{{ deleting.username || deleting.text }}» будет удалён из списка.</p><div v-if="error" role="alert" class="message error">{{ error }}</div><div class="modal-actions"><button class="secondary" :disabled="busy" @click="deleting = null">Отмена</button><button class="danger" :disabled="busy" @click="remove">Удалить</button></div></section></div>
  </div>
</template>
