/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const proxy = { '/api': 'http://127.0.0.1:4310' };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5199, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5199, strictPort: true, proxy },
  test: { include: ['src/**/*.test.ts'] },
});
