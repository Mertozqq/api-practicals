import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  server: { proxy: Object.fromEntries(['/api', '/graphql', '/rpc', '/docs', '/swagger', '/redoc', '/openapi.json', '/openapi.yaml', '/health'].map(path => [path, 'http://127.0.0.1:3000'])) },
});
