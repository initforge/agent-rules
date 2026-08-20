import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function removeCrossOrigin(): any {
  return {
    name: 'remove-crossorigin-attrs',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html.replace(/\s(crossorigin|crossorigin="[^"]*")/g, '');
    },
  };
}

export default defineConfig({
  plugins: [react(), removeCrossOrigin()],
  root: 'src/client',
  base: '/',
  publicDir: '../../public',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3099',
    },
  },
});
