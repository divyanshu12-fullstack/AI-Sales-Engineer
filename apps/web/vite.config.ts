import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, '');
  const port = Number(env.PORT?.trim() || '3001');

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT: expected an integer between 1 and 65535.');
  }

  const proxy = {
    '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: false },
    '^/privacy$': { target: `http://127.0.0.1:${port}`, changeOrigin: false },
  };

  return {
    plugins: [react(), tailwindcss()],
    envDir: workspaceRoot,
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  };
});
