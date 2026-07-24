import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
    open: true,
    historyApiFallback: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5328',
        changeOrigin: true,
      }
    }
  }
});
